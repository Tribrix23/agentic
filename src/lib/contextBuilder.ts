// ============================================================================
// Context Builder — Assembles optimal context for each LLM call
// ============================================================================

import { AIConfig, buildSystemPrompt, MODEL_PRESETS } from './aiConfig';
import { AgenticMessage, agenticMessageToChatMessage, ChatMessage } from './messageTypes';
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  calculateTokenBudget,
  TokenBudget,
  truncateToTokens,
} from './tokenCounter';

/** Project context information injected into the LLM */
export interface ProjectContext {
  rootPath: string;
  fileTree?: string;
  activeFilePath?: string;
  activeFileContent?: string;
  activeFileLanguage?: string;
  gitBranch?: string;
  gitStatus?: string;
  techStack?: string[];
}

/** Result of context building */
export interface BuiltContext {
  messages: ChatMessage[];
  tokenBudget: TokenBudget;
  toolDefinitions?: any[];
}

// ── Technology Detection ───────────────────────────────────────────────────

const TECH_INDICATORS: Record<string, string[]> = {
  'React': ['package.json:react', 'package.json:react-dom'],
  'Next.js': ['package.json:next', 'next.config'],
  'Vue': ['package.json:vue'],
  'Angular': ['package.json:@angular/core'],
  'Svelte': ['package.json:svelte'],
  'TypeScript': ['tsconfig.json'],
  'Tailwind CSS': ['tailwind.config'],
  'Node.js': ['package.json'],
  'Python': ['requirements.txt', 'pyproject.toml', 'setup.py'],
  'Rust': ['Cargo.toml'],
  'Go': ['go.mod'],
  'Java': ['pom.xml', 'build.gradle'],
  'Electron': ['package.json:electron'],
  '.NET': ['*.csproj', '*.sln'],
  'Docker': ['Dockerfile', 'docker-compose'],
};

/** Detect tech stack from file tree */
function detectTechStack(fileTree: string): string[] {
  const lower = fileTree.toLowerCase();
  const detected: string[] = [];

  for (const [tech, indicators] of Object.entries(TECH_INDICATORS)) {
    for (const indicator of indicators) {
      if (indicator.includes(':')) {
        // Check if file contains a specific dependency
        const [file, dep] = indicator.split(':');
        if (lower.includes(file) && lower.includes(dep)) {
          detected.push(tech);
          break;
        }
      } else {
        if (lower.includes(indicator.toLowerCase())) {
          detected.push(tech);
          break;
        }
      }
    }
  }

  return detected;
}

/** Detect language from file extension */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', cs: 'csharp',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml',
    md: 'markdown', sql: 'sql', sh: 'bash', bat: 'batch',
    toml: 'toml', ini: 'ini', env: 'env', dockerfile: 'dockerfile',
  };
  return langMap[ext] || ext;
}

// ── File Tree Formatting ───────────────────────────────────────────────────

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

/** Format file tree as indented string (limited depth for token efficiency) */
function formatFileTree(nodes: FileTreeNode[], prefix = '', maxDepth = 3, currentDepth = 0): string {
  if (currentDepth >= maxDepth) return '';

  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${node.name}${node.type === 'folder' ? '/' : ''}`);

    if (node.type === 'folder' && node.children && node.children.length > 0) {
      const childTree = formatFileTree(node.children, prefix + childPrefix, maxDepth, currentDepth + 1);
      if (childTree) lines.push(childTree);
    }
  }

  return lines.join('\n');
}

// ── Context Building ───────────────────────────────────────────────────────

/**
 * Build the complete context for an LLM API call.
 *
 * Allocates token budget across layers:
 * 1. System prompt (always included)
 * 2. Tool definitions (if agent mode)
 * 3. Project context (file tree, active file, git info)
 * 4. Conversation history (trimmed from oldest)
 * 5. Response budget (reserved for LLM output)
 */
export function buildContext(
  config: AIConfig,
  messages: AgenticMessage[],
  projectContext?: ProjectContext,
  toolDefinitions?: any[]
): BuiltContext {
  // ── 1. System Prompt ─────────────────────────────────────────────────
  const systemPromptText = buildSystemPrompt(config);
  const systemPromptParts: string[] = [systemPromptText];

  // ── 2. Project Context Injection ─────────────────────────────────────
  if (projectContext) {
    const projectLines: string[] = [];
    projectLines.push('\n<project_context>');
    projectLines.push(`Project Root: ${projectContext.rootPath}`);

    if (projectContext.gitBranch) {
      projectLines.push(`Git Branch: ${projectContext.gitBranch}`);
    }
    if (projectContext.gitStatus) {
      projectLines.push(`Git Status:\n${projectContext.gitStatus}`);
    }

    const techStack = projectContext.techStack ||
      (projectContext.fileTree ? detectTechStack(projectContext.fileTree) : []);
    if (techStack.length > 0) {
      projectLines.push(`Tech Stack: ${techStack.join(', ')}`);
    }

    if (projectContext.fileTree) {
      const treeSummary = truncateToTokens(projectContext.fileTree, 200);
      projectLines.push(`\nProject Structure (overview only — use listDirectory for actual contents):\n${treeSummary}`);
    }

    if (projectContext.activeFilePath) {
      projectLines.push(`\nActive File: ${projectContext.activeFilePath}`);
      if (projectContext.activeFileContent) {
        const truncated = truncateToTokens(projectContext.activeFileContent, 500);
        projectLines.push(`\`\`\`${projectContext.activeFileLanguage || ''}\n${truncated}\n\`\`\``);
      }
    }

    projectLines.push('</project_context>');
    systemPromptParts.push(projectLines.join('\n'));
  }

  if (toolDefinitions && toolDefinitions.length > 0) {
    let toolDefsStr = '';
    for (const wrappedTool of toolDefinitions) {
      const tool = wrappedTool.function || wrappedTool; // Support both wrapped and unwrapped formats
      toolDefsStr += `Tool Name: ${tool.name}\n`;
      toolDefsStr += `Description: ${tool.description}\n`;
      toolDefsStr += `Parameters: ${JSON.stringify(tool.parameters)}\n`;
      
      // Generate a dummy example based on the first property if available
      let exampleArgs = '{}';
      if (tool.parameters && tool.parameters.properties) {
        const props = Object.keys(tool.parameters.properties);
        if (props.length > 0) {
           exampleArgs = `{"${props[0]}": "..."}`;
        }
      }
      toolDefsStr += `Usage Example: call:${tool.name}${exampleArgs}\n\n`;
    }
    systemPromptParts.push(`\n<available_tools>\n${toolDefsStr}</available_tools>`);
  }

  const fullSystemPrompt = systemPromptParts.join('\n');
  const systemPromptTokens = estimateTokens(fullSystemPrompt);

  // ── 3. Tool Definitions Token Count ──────────────────────────────────
  const toolsTokens = toolDefinitions ? estimateToolsTokens(toolDefinitions) : 0;

  // ── 4. Calculate Available Budget for History ────────────────────────
  const responseReserved = config.maxTokens;
  const contextBudget = config.contextWindowSize;
  const overhead = systemPromptTokens + toolsTokens + responseReserved;
  const historyBudget = Math.max(0, contextBudget - overhead);

  // ── 5. Build Conversation Messages ───────────────────────────────────
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
  ];

  // Convert AgenticMessages to ChatMessages, fitting within budget
  const historyMessages: ChatMessage[] = [];
  let historyTokens = 0;

  // Process from newest to oldest, keeping as many as fit
  const nonSystemMessages = messages.filter((m) => m.role !== 'system' && !m.isHidden);

  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const chatMsg = agenticMessageToChatMessage(msg);

    // ALWAYS inject the tool results as plain text instead of native tool format.
    // The quantix backend API appears to silently drop or reject native tool_calls in history,
    // blinding the AI to its own past actions. By converting everything to plain text,
    // the AI can perfectly read its history and the backend won't strip it!
    
    if (msg.role === 'tool' && msg.toolName) {
      chatMsg.role = 'user';
      // Plain-text marker — no XML that the AI might mimic.
      // 6000 chars ≈ 1500 tokens — enough for a full config file or directory listing.
      const MAX_TOOL_RESULT = 6000;
      const truncated = chatMsg.content.length > MAX_TOOL_RESULT
        ? chatMsg.content.slice(0, MAX_TOOL_RESULT) + `\n... (output truncated at ${MAX_TOOL_RESULT} chars — use startLine/endLine args to read specific sections)`
        : chatMsg.content;
      chatMsg.content = `TOOL RESULT (${msg.toolName}):\n${truncated}`;
      delete chatMsg.tool_call_id;
      delete chatMsg.name;
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const toolCallDesc = msg.toolCalls
        .map((tc) => {
          // Plain text format — no XML, no brackets the AI will echo back.
          const argsStr = JSON.stringify(tc.arguments).slice(0, 120);
          let desc = `TOOL ACTION: ${tc.name}(${argsStr})`;
          if (tc.result) {
            const snippet = tc.result.output.slice(0, 600) + (tc.result.output.length > 600 ? '...' : '');
            desc += ` → ${tc.result.success ? 'OK' : 'ERROR'}: ${snippet}`;
          }
          return desc;
        })
        .join('\n');
      // Prepend a brief note so the AI knows this is history
      const historyNote = `[Actions taken in previous step - DO NOT REPEAT THESE]\n${toolCallDesc}`;
      chatMsg.content = chatMsg.content ? chatMsg.content + '\n\n' + historyNote : historyNote;
    }

    const msgTokens = estimateTokens(chatMsg.content) + 4;

    if (historyTokens + msgTokens > historyBudget) {
      // If we are about to drop messages, AT LEAST preserve the very first user prompt!
      // But for the current message, try to truncate it instead of outright dropping it.
      const remainingBudget = historyBudget - historyTokens;
      
      if (remainingBudget > 100) {
        // Truncate this message to fit the remaining budget
        chatMsg.content = truncateToTokens(chatMsg.content, remainingBudget - 20) + '\n...[TRUNCATED]';
        historyTokens += remainingBudget;
        historyMessages.unshift(chatMsg);
      }
      
      // Ensure the original user prompt is ALWAYS included
      if (i > 0) {
        const firstMsg = nonSystemMessages[0];
        const firstChatMsg = agenticMessageToChatMessage(firstMsg);
        historyMessages.unshift(firstChatMsg);
      }
      break;
    }

    historyTokens += msgTokens;
    historyMessages.unshift(chatMsg);
  }

  chatMessages.push(...historyMessages);

  // ── 6. Calculate Final Token Budget ──────────────────────────────────
  const tokenBudget = calculateTokenBudget({
    contextWindowSize: contextBudget,
    maxTokens: responseReserved,
    systemPromptTokens,
    toolsTokens,
    projectContextTokens: projectContext ? estimateTokens(JSON.stringify(projectContext)) : 0,
    historyTokens,
  });

  return {
    messages: chatMessages,
    tokenBudget,
    toolDefinitions,
  };
}

/**
 * Build a file tree string from project files data.
 * Used to create the fileTree for ProjectContext.
 */
export function buildFileTreeString(
  nodes: FileTreeNode[],
  maxDepth?: number
): string {
  return formatFileTree(nodes, '', maxDepth);
}

/**
 * Inject file contents into a user message for @-mentions.
 * When a user types @filename, this resolves the file and appends its content.
 */
export function resolveFileMentions(
  content: string,
  mentionedFiles: string[],
  fileContents: Record<string, string>
): string {
  if (!mentionedFiles || mentionedFiles.length === 0) return content;

  const fileBlocks: string[] = [];
  for (const filePath of mentionedFiles) {
    const fileContent = fileContents[filePath];
    if (fileContent) {
      const lang = detectLanguage(filePath);
      const truncated = truncateToTokens(fileContent, 2000);
      fileBlocks.push(`\n<file path="${filePath}">\n\`\`\`${lang}\n${truncated}\n\`\`\`\n</file>`);
    }
  }

  if (fileBlocks.length > 0) {
    return content + '\n\n' + fileBlocks.join('\n');
  }

  return content;
}

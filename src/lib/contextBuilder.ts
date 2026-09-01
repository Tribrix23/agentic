// ============================================================================
// Context Builder — Assembles optimal context for each LLM call
// ============================================================================

import { AIConfig, buildSystemPrompt } from './aiConfig';
import { AgenticMessage, agenticMessageToChatMessage, ChatMessage } from './messageTypes';
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  calculateTokenBudget,
  TokenBudget,
  truncateToTokens,
} from './tokenCounter';
import { ContextLedger, type ContextLedgerSnapshot } from './contextLedger';
import { selectToolProtocol, type ToolProtocol } from './agent/toolProtocol';

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
  agentSkillsBlock?: string;
}

/** Result of context building */
export interface BuiltContext {
  messages: ChatMessage[];
  tokenBudget: TokenBudget;
  toolDefinitions?: any[];
  ledger: ContextLedgerSnapshot;
}

function isGpt56Model(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes('gpt-5.6') || normalized.includes('gpt56');
}

export function getGptOssToolProtocol(model: string): ToolProtocol { return selectToolProtocol(model); }

export function detectCurrentWebIntent(text: string): boolean {
  return /(?:latest|current|recent|today|now|live|as of|release|version|news|browse|online|search the web|search internet|look up|find online|current version|documentation|docs|api reference|guide|tutorial)/i.test(text);
}

export function buildCurrentWebContract(toolDefinitions: any[]): string {
  const playwrightTools = toolDefinitions.filter(def => (def?.function?.name ?? def?.name)?.startsWith('mcp__playwright__'));
  const playwrightNames = new Set(playwrightTools.map(def => def?.function?.name ?? def?.name));
  const hasPlaywrightNavigation = playwrightNames.has('mcp__playwright__browser_navigate');
  const hasPlaywrightSnapshot = playwrightNames.has('mcp__playwright__browser_snapshot');
  const currentDateTime = new Date().toISOString();
  
  const parts = [
    '<current_web_policy>',
    `Current Date/Time: ${currentDateTime}`,
    'Your training data may be outdated. Always verify time-sensitive, current, or latest information via web search tools before answering from memory.',
  ];
  
  if (hasPlaywrightNavigation && hasPlaywrightSnapshot) {
    parts.push('The only web research path is the Playwright browser MCP. Do not use curl, fetch, readUrl, webSearch, or terminal commands for web research.');
    parts.push('## Autonomous Web Navigation');
    parts.push('When using Playwright browser tools for web research:');
    parts.push('1. **Search First**: Start with a search query to find relevant pages');
    parts.push('2. **Click and Navigate**: Click relevant search results, then take a snapshot');
    parts.push('3. **Continue Navigating**: After clicking a link, take another snapshot, then CONTINUE clicking relevant links until you reach the target information. Do not stop after the first snapshot.');
    parts.push('4. **Navigate Naturally**: Use breadcrumbs, menus, navigation bars, and sidebar links to find documentation sections. Navigate through the website like a human would.');
    parts.push('5. **Scroll for Content**: If the snapshot shows truncated content, "..." indicators, or if the answer isn\'t visible, scroll down using browser_scroll or browser_evaluate (window.scrollBy). Scroll to the bottom of the page to ensure all content is visible.');
    parts.push('6. **Snapshot Frequently**: Take snapshots after each navigation step (click, scroll, form fill) to understand the current page state.');
    parts.push('7. **Iterate Until Found**: If a snapshot doesn\'t contain the answer, identify relevant links and click them. Repeat until you find the target information.');
    parts.push('## Key Principles');
    parts.push('- Never stop after opening the browser or taking the first snapshot');
    parts.push('- Always continue navigating until you find the specific information requested');
    parts.push('- Use scrolling to access content outside the viewport');
    parts.push('- Navigate through site structure (menus, breadcrumbs) to find sections');
    parts.push('- Take snapshots after each action to understand page state');
    parts.push('- Browser actions are tool calls, not descriptions - execute them');
    parts.push('Tool names are dynamically advertised aliases. Use the exact listed alias and schema.');
  } else if (playwrightTools.length > 0) {
    parts.push('Use the available Playwright MCP tools for web discovery and continue the browser interaction as needed.');
  } else {
    parts.push('No browser web tool is available in this session. Do not substitute curl, fetch, or a terminal command; state that browser verification is unavailable.');
  }
  parts.push('Do not answer current factual questions from memory when a web tool is available.');
  parts.push('If no Playwright tool is available, explicitly state that browser verification is unavailable.');
  parts.push('Available web tools:');
  toolDefinitions
    .filter(def => (def?.function?.name ?? def?.name)?.startsWith('mcp__playwright__'))
    .forEach(def => {
      const name = def?.function?.name ?? def?.name;
      const desc = def?.function?.description ?? def?.description ?? '';
      parts.push(`- ${name}: ${desc}`);
    });
  parts.push('</current_web_policy>');
  return parts.join('\n');
}

/**
 * GPT-5.6 is served through a compatibility endpoint that may not expose native
 * function metadata to the model. Keep native tools in the API request, and add
 * this text contract so the local fallback parser can still execute every tool.
 */
export function buildGpt56ToolPrompt(toolDefinitions: any[]): string {
  const tools = toolDefinitions
    .map((definition) => definition?.function ?? definition)
    .filter((definition) => typeof definition?.name === 'string')
    .map((definition) => ({
      name: definition.name,
      description: definition.description || '',
      parameters: definition.parameters || { type: 'object', properties: {} },
    }));

  return [
    '<gpt56_tool_contract>',
    'You have access to every tool listed below. These tools are available in this session; never claim that a listed tool is unavailable.',
    'Use native function calling whenever it is available. If native function calling is not available, invoke tools using exactly:',
    '<tool_call><function=TOOL_NAME><parameter=ARGUMENT_NAME>ARGUMENT_VALUE</parameter></function></tool_call>',
    'For object or array argument values, put valid JSON inside the parameter element.',
    'When the user explicitly asks you to invoke a listed tool, invoke it instead of only describing it.',
    `Available tools (${tools.length}):`,
    JSON.stringify(tools),
    '</gpt56_tool_contract>',
  ].join('\n');
}

export function buildXmlToolPrompt(toolDefinitions: any[]): string {
  const tools = toolDefinitions.map((definition) => definition?.function ?? definition)
    .filter((definition) => typeof definition?.name === 'string')
    .map((tool) => ({ name: tool.name, description: tool.description || '', parameters: tool.parameters || {} }));
  return [
    '<xml_tool_protocol>',
    'XML is the only permitted tool-call syntax in this sub-agent. Native function calling is unavailable.',
    'Do not emit raw JSON, JSON inside a tool_call wrapper, call:name{...}, or a natural-language description instead of executing a tool.',
    'Use exactly: <tool_call><function=TOOL_NAME><parameter=ARGUMENT_NAME>VALUE</parameter></function></tool_call>',
    'Parameter values are text unless the schema says object or array. XML-escape text exactly once before placing it in a parameter: & becomes &amp;, < becomes &lt;, > becomes &gt;, " becomes &quot;, and \' becomes &apos;. The parser decodes these five entities exactly once before execution.',
    'Write complete source as the parameter value. Example: <tool_call><function=writeFile><parameter=path>index.html</parameter><parameter=content>&lt;!doctype html&gt;\n&lt;html&gt;\n&lt;body&gt;&lt;h1 class=&quot;title&quot;&gt;Hello &amp; welcome&lt;/h1&gt;&lt;/body&gt;\n&lt;/html&gt;</parameter></function></tool_call>',
    'Do not trim, summarize, replace, or omit source content. Encode a source literal &amp;lt; as &amp;amp;lt; so the resulting file contains &amp;lt;.',
    'Do not wrap parameter values in CDATA. CDATA is not part of this tool protocol; use the entity escaping rule above.',
    'Example: <tool_call><function=readFile><parameter=path>notes.txt</parameter></function></tool_call>',
    `Available tools: ${JSON.stringify(tools)}`,
    '</xml_tool_protocol>',
  ].join('\n');
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
  toolDefinitions?: any[],
  cachedSystemPrompt?: string,
  lastSentIndex?: number,
  toolProtocol: ToolProtocol = selectToolProtocol(config.model),
  interactionMode?: 'ask' | 'plan' | 'agent'
): BuiltContext {
  // ── 1. System Prompt ─────────────────────────────────────────────────
  // Use cached system prompt if provided, otherwise build it
  const systemPromptText = cachedSystemPrompt || buildSystemPrompt(config, interactionMode);
  const systemPromptParts: string[] = [systemPromptText];

  // GPT-5.6's compatibility endpoint can return plain text instead of native
  // tool_calls. Supplying the complete contract here keeps all registered tools
  // usable through AgentLoop's validated text-tool fallback.
  if (toolDefinitions?.length && isGpt56Model(config.model)) {
    systemPromptParts.push(buildGpt56ToolPrompt(toolDefinitions));
  }
  if (toolProtocol === 'xml' && toolDefinitions?.length) {
    systemPromptParts.push(buildXmlToolPrompt(toolDefinitions));
  }
  if (toolDefinitions?.length && detectCurrentWebIntent(messages.map(m => m.content || '').join('\n'))) {
    systemPromptParts.push(buildCurrentWebContract(toolDefinitions));
  }

  // ── 2. Project Context Injection ─────────────────────────────────────
  // Skip if cachedSystemPrompt is provided (it already includes project context)
  if (projectContext && !cachedSystemPrompt) {
    if (projectContext.agentSkillsBlock) {
      systemPromptParts.push(projectContext.agentSkillsBlock);
    }
    // Only include project-specific lines when a real project is open
    if (projectContext.rootPath) {
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
  }

  // Native tool definitions are also passed in the API payload. GPT-5.6 gets the
  // text contract above because its compatibility endpoint may hide that metadata.

  const fullSystemPrompt = systemPromptParts.join('\n');
  const systemPromptTokens = estimateTokens(fullSystemPrompt);

  // ── 3. Tool Definitions Token Count ──────────────────────────────────
  const toolsTokens = toolDefinitions ? estimateToolsTokens(toolDefinitions) : 0;

  // ── 4. Calculate Available Budget for History ────────────────────────
  const responseReserved = config.maxTokens;
  const contextBudget = config.contextWindowSize;
  const ledger = new ContextLedger(contextBudget);
  const overhead = systemPromptTokens + toolsTokens + responseReserved;
  const historyBudget = Math.max(0, contextBudget - overhead);
  ledger.record({ id: 'system', section: 'system', decision: 'included', requestedTokens: systemPromptTokens, includedTokens: systemPromptTokens });
  ledger.record({ id: 'tools', section: 'tools', decision: 'included', requestedTokens: toolsTokens, includedTokens: toolsTokens });
  ledger.record({ id: 'response', section: 'response', decision: 'reserved', requestedTokens: responseReserved, includedTokens: responseReserved });

  // ── 5. Build Conversation Messages ───────────────────────────────────
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
  ];

  // Convert AgenticMessages to ChatMessages, fitting within budget
  const historyMessages: ChatMessage[] = [];
  let historyTokens = 0;

  // Process from newest to oldest, keeping as many as fit
  const nonSystemMessages = messages.filter((m) => m.role !== 'system' && !m.isHidden);

  // Token optimization: Delta message injection
  // If lastSentIndex is provided, compress messages before it more aggressively
  const isNewMessage = (index: number) => lastSentIndex === undefined || index >= lastSentIndex;

  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msg = nonSystemMessages[i];
    const chatMsg = agenticMessageToChatMessage(msg, toolProtocol);
    const isMsgNew = isNewMessage(i);
    const preserveNativeToolHistory = toolProtocol !== 'xml' && isGpt56Model(config.model) && Boolean(toolDefinitions?.length);

    if (toolProtocol !== 'xml' && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && !preserveNativeToolHistory) {
      const toolCallDesc = msg.toolCalls
        .map((tc) => {
          let xml = `<tool_call>\n<function=${tc.name}>\n`;
          for (const [k, v] of Object.entries(tc.arguments || {})) {
            xml += `<parameter=${k}>${typeof v === 'string' ? v : JSON.stringify(v)}</parameter>\n`;
          }
          xml += `</function>\n</tool_call>`;
          return xml;
        })
        .join('\n');
      chatMsg.content = chatMsg.content ? chatMsg.content + '\n\n' + toolCallDesc : toolCallDesc;
      // Remove native tool_calls since we injected them as XML text
      delete chatMsg.tool_calls;
    }

    if (toolProtocol !== 'xml' && msg.role === 'tool' && msg.toolName && !preserveNativeToolHistory) {
      chatMsg.role = 'user';
      // Plain-text marker — no XML that the AI might mimic.
      // For new messages (delta), keep full output. For old messages, compress aggressively.
      // For consumed messages, compress even more aggressively.
      const MAX_TOOL_RESULT_NEW = 60000;      // ~45k tokens — enough for most large files
      const MAX_TOOL_RESULT_OLD = 20000;       // Increased to 20k to avoid truncating small-medium files in history (fixes the 5KB truncation bug)
      const MAX_TOOL_RESULT_CONSUMED = 1000;   // Ultra-compressed for consumed messages

      let maxResult = isMsgNew ? MAX_TOOL_RESULT_NEW : MAX_TOOL_RESULT_OLD;
      if (msg.wasConsumed) {
        maxResult = MAX_TOOL_RESULT_CONSUMED;
      }

      let truncated = chatMsg.content;
      if (chatMsg.content.length > maxResult) {
        const sliced = chatMsg.content.slice(0, maxResult);
        // Estimate which line we stopped at so the AI knows the exact next startLine
        const linesRead = sliced.split('\n').length;
        const artifactId = msg.toolCalls?.find(call => call.result?.artifactRef)?.result?.artifactRef?.id;
        truncated = sliced +
          `\n... [CONTEXT TRUNCATED at ${maxResult} chars / ~line ${linesRead}]` +
          (artifactId
            ? ` — continue with readArtifact({ artifactId: "${artifactId}", offset: ${maxResult} }).`
            : ' — rerun the originating tool with a narrower range or result limit.');
      }
      chatMsg.content = `TOOL RESULT (${msg.toolName}):\n${truncated}`;
      delete chatMsg.tool_call_id;
      delete chatMsg.name;
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
        ledger.record({ id: msg.id, section: 'history', decision: 'truncated', requestedTokens: msgTokens, includedTokens: remainingBudget, reason: 'history budget exhausted' });
      } else {
        ledger.record({ id: msg.id, section: 'history', decision: 'dropped', requestedTokens: msgTokens, includedTokens: 0, reason: 'history budget exhausted' });
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
    ledger.record({ id: msg.id, section: 'history', decision: 'included', requestedTokens: msgTokens, includedTokens: msgTokens });
  }

  chatMessages.push(...historyMessages);

  // GPT-5.6 validates the complete native tool-call chain on every request.
  // A cancelled/older conversation can contain an assistant tool call without
  // its result; remove that incomplete assistant turn before sending history.
  if (preserveNativeToolHistoryForConfig(config, toolDefinitions)) {
    normalizeNativeToolHistory(chatMessages);
  }

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
    ledger: ledger.snapshot(),
  };
}

function preserveNativeToolHistoryForConfig(config: AIConfig, toolDefinitions?: any[]): boolean {
  return Boolean(toolDefinitions?.length) && isGpt56Model(config.model);
}

function normalizeNativeToolHistory(messages: ChatMessage[]): void {
  const normalized: ChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === 'tool') {
      console.warn(`[ContextBuilder] Removed orphaned tool result ${message.tool_call_id || '(missing id)'} from history.`);
      continue;
    }

    if (message.role !== 'assistant' || !message.tool_calls?.length) {
      normalized.push(message);
      continue;
    }

    const following: ChatMessage[] = [];
    let nextIndex = i + 1;
    while (nextIndex < messages.length && messages[nextIndex].role === 'tool') {
      following.push(messages[nextIndex]);
      nextIndex++;
    }

    const completeCalls = message.tool_calls.filter((call) =>
      following.some((candidate) => candidate.role === 'tool' && candidate.tool_call_id === call.id)
    );

    if (completeCalls.length > 0) {
      normalized.push(
        completeCalls.length === message.tool_calls.length
          ? message
          : { ...message, tool_calls: completeCalls }
      );
      normalized.push(...following.filter((result) =>
        completeCalls.some((call) => call.id === result.tool_call_id)
      ));
    } else if (message.content) {
      normalized.push({ role: 'assistant', content: message.content });
    }

    const removedCount = message.tool_calls.length - completeCalls.length;
    if (removedCount > 0) {
      console.warn(`[ContextBuilder] Removed ${removedCount} dangling native tool call(s) from history.`);
    }

    i = nextIndex - 1;
  }

  messages.splice(0, messages.length, ...normalized);
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

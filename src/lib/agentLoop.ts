// ============================================================================
// Agent Loop — Core ReAct-style agentic reasoning engine
// ============================================================================
//
//  ┌───────────────────────────────────────────────┐
//  │  1. User sends message                        │
//  │  2. Build context (system + history + tools)   │
//  │  3. Call LLM ─► stream response               │
//  │  4. Parse response:                           │
//  │     ├─ Text → display to user                 │
//  │     ├─ Tool call → execute tool               │
//  │     │   ├─ Check permissions                  │
//  │     │   ├─ Wait for approval (if needed)      │
//  │     │   ├─ Execute & format result            │
//  │     │   └─ Append to messages                 │
//  │     └─ Loop back to step 3                    │
//  │  5. Safety: stop after maxAgentIterations     │
//  └───────────────────────────────────────────────┘

import { AIConfig, getAIConfig, buildSystemPrompt } from './aiConfig';
import {
  AgenticMessage,
  ToolCall,
  ToolResult,
  createAssistantMessage,
  createToolMessage,
  createToolCall,
  createUserMessage,
} from './messageTypes';
import { buildContext, buildGpt56ToolPrompt, ProjectContext } from './contextBuilder';
import {
  needsSummarization,
  buildSummaryRequest,
  applySummarization,
  splitForSummarization,
} from './contextSummarizer';
import { estimateTokens, truncateToTokens } from './tokenCounter';
import type { TokenBudget } from './tokenCounter';
import { callDispatcherAPI } from '../api';
import { TokenBillingSession } from './tokenQuota';
import { SecurityInterceptor } from './SecurityInterceptor';
import { createTask, updateTask, getTasksForConversation } from './taskStore';
import { TaskGraph } from './taskGraph';
import { ParallelToolExecutor } from './parallelExecutor';

// ── Agent Events ───────────────────────────────────────────────────────────

export type AgentEventType =
  | 'agent:thinking'
  | 'agent:streaming'
  | 'agent:tool-call'
  | 'agent:tool-approval-needed'
  | 'agent:tool-executing'
  | 'agent:tool-result'
  | 'agent:response'
  | 'agent:done'
  | 'agent:error'
  | 'agent:iteration'
  | 'agent:summarizing'
  | 'agent:token-budget'
  | 'agent:message-added'
  | 'agent:message-updated' // fired when toolCalls/content change on an existing message
  | 'agent:tasks-created'
  | 'agent:planning-started'
  | 'agent:planning-complete'
  | 'agent:reflection-started'
  | 'agent:reflection-complete'
  | 'agent:clarification-needed'
  | 'agent:progress-update'
  | 'agent:goal-satisfied'
  | 'agent:goal-not-satisfied'
  | 'agent:sleeping'
  | 'agent:wakeup'
  | 'agent:coding-started'
  | 'agent:coding-progress'
  | 'agent:coding-complete'
  | 'agent:tool-streaming';  // fired during stream when a file tool call is detected

export interface AgentEvent {
  type: AgentEventType;
  data?: any;
}

export type AgentEventCallback = (event: AgentEvent) => void;

// ── Agent State ────────────────────────────────────────────────────────────

export interface AgentState {
  isRunning: boolean;
  currentIteration: number;
  maxIterations: number;
  status: string;
  currentToolCall?: ToolCall;
  tokenBudget?: TokenBudget;
  startTime?: number;
  elapsedMs?: number;
  consecutiveDuplicates?: number;
  consecutiveErrors?: number;
  lastToolSignature?: string;

  // Sophisticated agent state
  phase: 'idle' | 'understanding' | 'planning' | 'executing' | 'reflecting' | 'validating' | 'done';
  goal?: string;
  goalSatisfied: boolean;
  progress: number; // 0-100
  estimatedRemainingMs?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  stuckCount: number;
  conversationId?: string;
  hasNudgedForDelegation?: boolean;
}

// ── Tool Call Parsing ──────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  arguments: Record<string, any>;
}

/** Common HTML tag names that must never be treated as tool calls. */
const HTML_TAG_NAMES = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend',
  'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol',
  'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre', 'progress', 'q', 'rp', 'rt',
  'ruby', 's', 'samp', 'script', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong',
  'style', 'sub', 'summary', 'sup', 'svg', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot',
  'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
]);

function isPlausibleToolName(name: string, knownToolNames?: Set<string>): boolean {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || name.length > 50) {
    return false;
  }

  if (knownToolNames && knownToolNames.size > 0) {
    return knownToolNames.has(name);
  }

  if (HTML_TAG_NAMES.has(name.toLowerCase())) {
    return false;
  }

  // Project tools use camelCase; reject all-lowercase names like "meta" or "script".
  return /[A-Z]/.test(name);
}

function getKnownToolNames(toolDefinitions: any[]): Set<string> {
  const names = new Set<string>();
  for (const def of toolDefinitions) {
    const name = def?.function?.name ?? def?.name;
    if (typeof name === 'string' && name.length > 0) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Parse tool calls from LLM response text.
 * Primary format: <tool_call><function=name><parameter=arg>value</parameter></function></tool_call>
 * All other formats are legacy fallbacks.
 */
function parseToolCallsFromText(text: string, knownToolNames?: Set<string>): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;

  // ── Format 1 (PRIMARY): <tool_call><function=name><parameter=x>val</parameter></function></tool_call> ──
  const primaryRegex = /<tool_call>\s*<function=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/gi;
  while ((match = primaryRegex.exec(text)) !== null) {
    const name = match[1].trim();
    const argsStr = match[2];
    const args: Record<string, any> = {};
    const paramRegex = /<parameter=([a-zA-Z0-9_-]+)>([\s\S]*?)<\/parameter>/gi;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(argsStr)) !== null) {
      let val: any = paramMatch[2].trim();
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (!isNaN(Number(val)) && val !== '') val = Number(val);
      args[paramMatch[1].trim()] = val;
    }

    // Fallback: If no <parameter=X> tags were found, try standard XML tags <X>val</X>
    if (Object.keys(args).length === 0) {
      const standardXmlRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/gi;
      let xmlMatch;
      while ((xmlMatch = standardXmlRegex.exec(argsStr)) !== null) {
        let val: any = xmlMatch[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        args[xmlMatch[1].trim()] = val;
      }
    }

    if (isPlausibleToolName(name, knownToolNames)) {
      toolCalls.push({ name, arguments: args });
    }
  }

  if (toolCalls.length > 0) return toolCalls;

  // ── Fallback Format: Antigravity native syntax: call:tool_name{json_args} ────────────────
  let startIndex = text.indexOf('call:');
  while (startIndex !== -1) {
    const braceIndex = text.indexOf('{', startIndex);
    if (braceIndex !== -1 && braceIndex < startIndex + 50) {
      const toolName = text.substring(startIndex + 5, braceIndex).trim();
      if (!isPlausibleToolName(toolName, knownToolNames)) {
        startIndex = text.indexOf('call:', startIndex + 5);
        continue;
      }
      let braceCount = 0;
      let endIndex = -1;
      for (let i = braceIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') { braceCount--; if (braceCount === 0) { endIndex = i; break; } }
      }
      if (endIndex !== -1) {
        try {
          const argsStr = text.substring(braceIndex, endIndex + 1);
          const parsedArgs = argsStr === '{}' ? {} : JSON.parse(argsStr);
          toolCalls.push({ name: toolName, arguments: parsedArgs });
          startIndex = text.indexOf('call:', endIndex + 1);
          continue;
        } catch (e) {}
      }
    }
    startIndex = text.indexOf('call:', startIndex + 5);
  }
  if (toolCalls.length > 0) return toolCalls;

  // ── Fallback: JSON <tool_call> with JSON body ────────────────────────────
  const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  while ((match = xmlRegex.exec(text)) !== null) {
    const innerText = match[1].trim();
    if (innerText.startsWith('<')) continue;
    try {
      const parsed = JSON.parse(innerText);
      if (parsed.name && isPlausibleToolName(parsed.name, knownToolNames)) {
        toolCalls.push({ name: parsed.name, arguments: parsed.arguments || parsed.params || parsed.args || {} });
      }
    } catch (e) {}
  }
  if (toolCalls.length > 0) return toolCalls;

  // ── Fallback: JSON code blocks / raw JSON ────────────────────────────────
  {
    let si = text.indexOf('{');
    while (si !== -1) {
      let bc = 0, ei = -1;
      for (let i = si; i < text.length; i++) {
        if (text[i] === '{') bc++;
        else if (text[i] === '}') { bc--; if (bc === 0) { ei = i; break; } }
      }
      if (ei !== -1) {
        try {
          const parsed = JSON.parse(text.substring(si, ei + 1));
          if (parsed.tool_call || (parsed.name && Object.keys(parsed).includes('arguments'))) {
            const tc = parsed.tool_call || parsed;
            if (tc.name && isPlausibleToolName(tc.name, knownToolNames)) {
              toolCalls.push({ name: tc.name, arguments: tc.arguments || tc.params || tc.args || {} });
              si = text.indexOf('{', ei + 1); continue;
            }
          } else if (Object.keys(parsed).length === 1) {
            const possibleName = Object.keys(parsed)[0];
            const possibleArgs = parsed[possibleName];
            if (typeof possibleArgs === 'object' && possibleArgs !== null && !Array.isArray(possibleArgs) && isPlausibleToolName(possibleName, knownToolNames)) {
              toolCalls.push({ name: possibleName, arguments: possibleArgs });
              si = text.indexOf('{', ei + 1); continue;
            }
          } else if (parsed.tool && typeof parsed.tool === 'string' && isPlausibleToolName(parsed.tool, knownToolNames)) {
            const args = { ...parsed }; delete args.tool;
            toolCalls.push({ name: parsed.tool, arguments: args });
            si = text.indexOf('{', ei + 1); continue;
          }
        } catch (e) {}
      }
      si = text.indexOf('{', si + 1);
    }
  }

  return toolCalls;
}

/**
 * Deduplicate tool calls by name and arguments to prevent redundant executions.
 * Returns a new array with duplicates removed (keeping only the first occurrence).
 */
function deduplicateToolCalls(toolCalls: ParsedToolCall[]): ParsedToolCall[] {
  const seen = new Set<string>();
  const deduplicated: ParsedToolCall[] = [];
  
  for (const tc of toolCalls) {
    // Create a unique key based on tool name and stringified arguments
    const key = `${tc.name}:${JSON.stringify(tc.arguments)}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(tc);
    } else {
      console.warn(`[AgentLoop] Deduplicated tool call: ${tc.name} with arguments`, tc.arguments);
    }
  }
  
  return deduplicated;
}

/**
 * Strip tool call blocks from text to get clean display text.
 * Handles XML-style, backtick-wrapped JSON, [TOOL:] style, and raw JSON blobs.
 */
function stripToolCallBlocks(text: string, parsedToolCalls?: ParsedToolCall[]): string {
  let cleaned = text;
  // Format 1: XML tool_call tags
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  // Format 2: Backtick-wrapped JSON blocks containing tool_call
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"tool_call"[\s\S]*?\}\s*\n?\s*```/gi, '');
  // Format 3: [TOOL:name] style
  cleaned = cleaned.replace(/\[TOOL:\s*\w+\]\s*```(?:json)?\s*\n?[\s\S]*?\n?\s*```/gi, '');
  // Format 4: Raw JSON blobs that were parsed by the bracket-matching parser.
  // We try to find and remove any top-level JSON object containing "tool_call".
  if (parsedToolCalls && parsedToolCalls.length > 0) {
    let startIndex = cleaned.indexOf('{');
    while (startIndex !== -1) {
      let braceCount = 0;
      let endIndex = -1;
      for (let i = startIndex; i < cleaned.length; i++) {
        if (cleaned[i] === '{') braceCount++;
        else if (cleaned[i] === '}') {
          braceCount--;
          if (braceCount === 0) { endIndex = i; break; }
        }
      }
      if (endIndex !== -1) {
        const candidate = cleaned.substring(startIndex, endIndex + 1);
        if (candidate.includes('"tool_call"') || candidate.includes('"name"')) {
          try {
            const parsed = JSON.parse(candidate);
            if (parsed.tool_call || (parsed.name && 'arguments' in parsed)) {
              cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex + 1);
              continue; // don't advance startIndex, re-scan from same position
            }
          } catch (e) { /* not valid JSON, skip */ }
        }
      }
      startIndex = cleaned.indexOf('{', startIndex + 1);
    }
  }

  // Format 5: History-echo artifacts — all variants the AI may mimic
  // Old bracket formats
  cleaned = cleaned.replace(/\[Called tool:[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\[Result:[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\[Tool Result:[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\[Actions taken[^\]]*\]/gi, '');
  // New plain-text history format echoes
  cleaned = cleaned.replace(/^TOOL RESULT \([^)]+\):.*$/gim, '');
  cleaned = cleaned.replace(/^TOOL ACTION: \w+.*$/gim, '');
  cleaned = cleaned.replace(/^\[Actions taken in previous step\].*$/gim, '');
  // XML past_action / past_tool_result — match even if malformed/unclosed
  cleaned = cleaned.replace(/<past_action[\s\S]*?(?:<\/past_action>|$)/gi, '');
  cleaned = cleaned.replace(/<past_tool_result[\s\S]*?(?:<\/past_tool_result>|$)/gi, '');
  // Orphaned closing XML tags from mixed format echoes
  cleaned = cleaned.replace(/<\/(?:past_action|past_tool_result|arg_value|arg_key|tool_call)>/gi, '');
  // Format 6: Self-closing XML tool calls (e.g. <listDirectory path="..." />)
  cleaned = cleaned.replace(/<[a-zA-Z][a-zA-Z0-9_]+\s+[^>]*?\/>/gi, '');
  // Format 7: Native <function=name> format
  cleaned = cleaned.replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, '');
  // Do NOT strip <think> blocks here. Let MessageBubble.tsx handle extracting and stripping them
  // so that the UI can actually render the thinking steps.
  return cleaned.trim();
}

// ── Agent Loop Class ───────────────────────────────────────────────────────

export class AgentLoop {
  private config: AIConfig;
  private projectContext?: ProjectContext;
  private eventCallback: AgentEventCallback;
  private abortController: AbortController | null = null;
  private state: AgentState;
  private toolExecutor: ((toolCall: ToolCall) => Promise<ToolResult>) | null = null;
  private toolDefinitions: any[] = [];
  private executedToolNames: Set<string> = new Set();
  private successfulFileWrites: number = 0;
  private options?: AgentLoopOptions;
  /** Dependency-aware parallel executor for write tools — uses ParallelToolExecutor's
   * file-dependency analysis to safely run independent writes concurrently. */
  private parallelExecutor?: ParallelToolExecutor;
  
  // Token optimization: cache static content
  private cachedSystemPrompt?: string;
  private lastSentMessageIndex = 0;

  constructor(
    config: AIConfig,
    eventCallback: AgentEventCallback,
    options?: AgentLoopOptions
  ) {
    this.config = config;
    this.eventCallback = eventCallback;
    this.projectContext = options?.projectContext;
    this.toolExecutor = options?.toolExecutor || null;
    this.toolDefinitions = options?.toolDefinitions || [];
    this.options = options;

    this.state = {
      isRunning: false,
      currentIteration: 0,
      maxIterations: config.maxAgentIterations,
      status: 'idle',
      phase: 'understanding',
      goalSatisfied: false,
      progress: 0,
      stuckCount: 0,
      conversationId: options?.conversationId,
    };
    
    // Store the conversation ID for when state is re-initialized in run()
    this.conversationId = options?.conversationId;
  }
  
  private conversationId?: string;

  private resolveWakeup: ((value: void | PromiseLike<void>) => void) | null = null;
  private isSleeping = false;
  private pendingMessages: AgenticMessage[] = [];
  public activeSubagentCount = 0;
  private isStreaming = false; // Dedicated flag to track active streaming

  /** Queue a message to be processed when the agent wakes up, without actually waking it up */
  addPendingMessage(msg: AgenticMessage): void {
    this.pendingMessages.push(msg);
  }

  /** Called by the sub-agent spawner to increment/decrement active sub-agent count */
  notifySubagentSpawned(): void {
    this.activeSubagentCount++;
  }

  notifySubagentDone(): void {
    this.activeSubagentCount = Math.max(0, this.activeSubagentCount - 1);
  }

  /** Wake up the agent loop with new messages */
  wakeup(newMessages?: AgenticMessage[]): void {
    if (this.isSleeping && this.resolveWakeup) {
      if (newMessages && newMessages.length > 0) {
        this.pendingMessages.push(...newMessages);
      }
      this.isSleeping = false;
      this.resolveWakeup();
      this.resolveWakeup = null;
    }
  }

  /** Get current agent state */
  getState(): AgentState {
    return { ...this.state };
  }

  /** Stop the agent loop */
  stop(): void {
    console.log('[AgentLoop] stop() called');
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isStreaming = false; // Reset streaming flag
    this.isSleeping = false; // Wake up if sleeping
    if (this.resolveWakeup) {
      this.resolveWakeup();
      this.resolveWakeup = null;
    }
    this.state.isRunning = false;
    this.state.status = 'stopped';
    this.state.phase = 'done';
    this.emit({ type: 'agent:done', data: { reason: 'user_cancelled' } });
  }

  /** Update configuration */
  updateConfig(config: AIConfig): void {
    this.config = config;
    this.state.maxIterations = config.maxAgentIterations;
  }

  /** Update tool definitions */
  updateTools(definitions: any[], executor: (toolCall: ToolCall) => Promise<ToolResult>): void {
    this.toolDefinitions = definitions;
    this.toolExecutor = executor;
    // (Re-)initialize the parallel executor whenever the tool executor changes
    this.parallelExecutor = new ParallelToolExecutor(
      executor as any, // ToolCall types are structurally identical — same re-export from messageTypes
      { maxConcurrency: 4 }
    );
  }

  /**
   * Run the agent loop for a user message.
   *
   * @param messages - The full conversation history (including the new user message)
   * @returns Updated messages array with all agent responses appended
   */
  async run(messages: AgenticMessage[]): Promise<AgenticMessage[]> {
    this.abortController = new AbortController();
    this.state = {
      isRunning: true,
      currentIteration: 0,
      maxIterations: this.config.maxAgentIterations,
      status: 'thinking',
      startTime: Date.now(),
      phase: 'understanding',
      goalSatisfied: false,
      progress: 0,
      stuckCount: 0,
      conversationId: this.conversationId,
    };

    const updatedMessages = [...messages];

    try {
      // ── PHASE 1: UNDERSTANDING ───────────────────────────────────────────
      this.state.phase = 'understanding';
      this.state.status = 'Understanding request...';
      this.emit({ type: 'agent:thinking' });

      const userMessage = updatedMessages[updatedMessages.length - 1];
      if (userMessage.role === 'user') {
        // Extract goal from user message
        this.state.goal = userMessage.content;
        
        // Check for ambiguities that need clarification
        const clarification = await this.detectAmbiguities(userMessage.content);
        if (clarification) {
          this.state.needsClarification = true;
          this.state.clarificationQuestion = clarification;
          this.emit({ type: 'agent:clarification-needed', data: { question: clarification } });
          // Wait for user response (in real implementation, would pause here)
        }
      }

      // ── Auto-summarize if needed ───────────────────────────────────────
      const contextBudget = this.config.contextWindowSize - this.config.maxTokens;
      if (needsSummarization(updatedMessages, contextBudget * 0.7)) {
        this.emit({ type: 'agent:summarizing' });
        this.state.status = 'Summarizing conversation history...';

        const { toSummarize, toKeep } = splitForSummarization(updatedMessages, 8);
        if (toSummarize.length > 0) {
          const summaryText = toSummarize
            .slice(-10)
            .map((m) => `[${m.role}]: ${m.content.slice(0, 100)}`)
            .join('\n');
          const summarized = applySummarization(updatedMessages, summaryText, 8);
          updatedMessages.length = 0;
          updatedMessages.push(...summarized);
        }
      }

      // ── PHASE 2: PLANNING ───────────────────────────────────────────────
      this.state.phase = 'planning';
      this.state.status = 'Planning approach...';
      this.emit({ type: 'agent:planning-started' });

      const taskGraph = await this.planExecution(updatedMessages);
      this.emit({ type: 'agent:planning-complete', data: { 
        taskCount: taskGraph.getStats().totalTasks,
        criticalPath: taskGraph.getCriticalPath()
      }});

      // ── PHASE 3: EXECUTION ───────────────────────────────────────────────
      this.state.phase = 'executing';
      this.state.status = 'Executing tasks...';
      
      // ── Token Optimization: Cache static system prompt + project context ──
      // This avoids rebuilding the ~1800-2500 token system prompt on every iteration
      const systemPromptText = buildSystemPrompt(this.config);
      let fullSystemPrompt = systemPromptText;

      // The cached prompt is passed back into buildContext on every iteration.
      // Therefore the model-specific tool contract must be added while creating
      // the cache; buildContext cannot add it later when a cached prompt exists.
      if (
        this.toolDefinitions.length > 0 &&
        (this.config.model.toLowerCase().includes('gpt-5.6') || this.config.model.toLowerCase().includes('gpt56'))
      ) {
        fullSystemPrompt += '\n' + buildGpt56ToolPrompt(this.toolDefinitions);
      }
      
      if (this.projectContext) {
        const projectLines: string[] = [];
        projectLines.push('\n<project_context>');
        projectLines.push(`Project Root: ${this.projectContext.rootPath}`);
        if (this.projectContext.gitBranch) {
          projectLines.push(`Git Branch: ${this.projectContext.gitBranch}`);
        }
        if (this.projectContext.gitStatus) {
          projectLines.push(`Git Status:\n${this.projectContext.gitStatus}`);
        }
        if (this.projectContext.techStack && this.projectContext.techStack.length > 0) {
          projectLines.push(`Tech Stack: ${this.projectContext.techStack.join(', ')}`);
        }
        if (this.projectContext.fileTree) {
          const treeSummary = truncateToTokens(this.projectContext.fileTree, 200);
          projectLines.push(`\nProject Structure (overview only — use listDirectory for actual contents):\n${treeSummary}`);
        }
        if (this.projectContext.activeFilePath) {
          projectLines.push(`\nActive File: ${this.projectContext.activeFilePath}`);
          if (this.projectContext.activeFileContent) {
            const truncated = truncateToTokens(this.projectContext.activeFileContent, 500);
            projectLines.push(`\`\`\`${this.projectContext.activeFileLanguage || ''}\n${truncated}\n\`\`\``);
          }
        }
        projectLines.push('</project_context>');
        fullSystemPrompt += '\n' + projectLines.join('\n');
      }
      
      this.cachedSystemPrompt = fullSystemPrompt;
      this.lastSentMessageIndex = 0; // Reset for new run
      
      // ── Agent iteration loop ─────────────────────────────────────────
      let continueLoop = true;
      this.executedToolNames.clear();
      this.successfulFileWrites = 0;

      while (continueLoop && this.state.isRunning) {
        this.state.currentIteration++;
        this.state.elapsedMs = Date.now() - (this.state.startTime || Date.now());

        // Safety check
        if (this.state.currentIteration > this.state.maxIterations) {
          this.emit({
            type: 'agent:error',
            data: { message: `Agent reached maximum iterations (${this.state.maxIterations})` },
          });
          break;
        }

        this.emit({
          type: 'agent:iteration',
          data: { iteration: this.state.currentIteration, maxIterations: this.state.maxIterations },
        });

        // ── PHASE 4: REFLECTION (before each iteration) ───────────────
        await this.reflectOnProgress(updatedMessages, taskGraph);

        // ── We removed the Review Phase to adhere to a single simpler architecture.


        // ── Build context ──────────────────────────────────────────────
        // Always provide tool definitions in the system prompt so the AI knows
        // what tools are available. For models that don't support native tools
        // (supportsTools: false), the API layer will strip them from the payload
        // and the AI will use the JSON-fallback format in the system prompt instead.
        const hasTools = this.config.agentMode && this.toolDefinitions.length > 0;
        const context = buildContext(
          this.config,
          updatedMessages,
          this.projectContext,
          hasTools ? this.toolDefinitions : undefined,
          this.cachedSystemPrompt, // Pass cached system prompt to avoid rebuilding
          this.lastSentMessageIndex // Pass for delta message injection
        );
        // shouldUseTools controls whether we pass native tools in the API payload.
        // We always pass them in context above; this only affects api.ts behavior.
        const shouldUseTools = hasTools;

        this.emit({ type: 'agent:token-budget', data: context.tokenBudget });
        this.state.tokenBudget = context.tokenBudget;

        // ── Create assistant message ─────────────────────────────────────
        const assistantMsg = createAssistantMessage(this.config.model);
        assistantMsg.agentIteration = this.state.currentIteration;
        updatedMessages.push(assistantMsg);
        this.emit({ type: 'agent:message-added', data: assistantMsg });

        this.state.status = 'Generating response...';
        this.emit({ type: 'agent:thinking' });

        // ── Call LLM via API ──────────────────────────────────────────────
        const startTime = Date.now();
        const effectiveConfig = { ...this.config };
        let fullResponseText = '';
        this.isStreaming = true; // Set streaming flag before API call
        console.log('[AgentLoop] Starting API call, isStreaming set to true');
        
        await new Promise<void>((resolve, reject) => {
          if (!this.state.isRunning) {
            console.log('[AgentLoop] state.isRunning is false, resolving immediately');
            resolve();
            return;
          }

          const startTime = Date.now();

          // Role-Based Dynamic Temperature
          const effectiveConfig = { ...this.config };
          if (this.options?.agentRole === 'orchestrator') {
            // State-Aware Profile: check if the last message is a tool response
            const lastMsg = context.messages[context.messages.length - 1];
            if (lastMsg && lastMsg.role === 'tool') {
              // Executor Mode: highly deterministic for running commands / exact file edits
              effectiveConfig.temperature = 0.2;
              effectiveConfig.topP = 0.5;
            } else {
              // Planner Mode: moderate creativity to brainstorm tasks (avoids loop)
              effectiveConfig.temperature = 0.5;
              effectiveConfig.topP = 0.9;
            }
            // Provide a flag so `api.ts` bypasses token-based logic
            (effectiveConfig as any).strictRole = true;
          }

          callDispatcherAPI({
            config: effectiveConfig,
            // Preserve native assistant tool_calls and matching role=tool results
            // for GPT-5.6's function-call protocol.
            messages: context.messages.map(m => ({
              ...m,
              // Native GPT-5.6 calls require the assistant tool_calls message
              // to be followed by a role=tool message with the same call ID.
              role: m.role as 'user' | 'assistant' | 'system' | 'tool',
            })),
            // Always pass tool definitions; api.ts will filter based on model's supportsTools flag
            tools: shouldUseTools ? this.toolDefinitions : undefined,
            conversationId: this.state.conversationId,
            billingSession: this.options?.billingSession,
            onChunk: (chunk: string) => {
              fullResponseText += chunk;
              assistantMsg.isStreaming = true;
              
              // Stateful real-time parser to separate thinking and hide JSON
              let textToDisplay = fullResponseText;
              
              // 1. Extract thinking block and discard any text before it
              const thinkStart = textToDisplay.indexOf('<think');
              let afterThink = textToDisplay;
              
              if (thinkStart !== -1) {
                const thinkEnd = textToDisplay.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  const closeBracket = textToDisplay.indexOf('>', thinkEnd);
                  if (closeBracket !== -1) {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart, closeBracket + 1);
                    afterThink = textToDisplay.substring(closeBracket + 1); // Extract everything after!
                  } else {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                    afterThink = '';
                  }
                } else {
                  assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                  afterThink = '';
                }
              } else if (textToDisplay.trim().startsWith('<') && textToDisplay.length < 20) {
                assistantMsg.thinkingContent = textToDisplay;
                afterThink = '';
              }
              
              // 2. Put text outside of thinking into the thought block until a tool call marker is seen
              let hideText = false;
              if (assistantMsg.thinkingContent && afterThink.trim().length > 0) {
                const toolMatch = afterThink.match(/```(?:json)?|<function=|\[TOOL:|call:|\{/i);
                if (toolMatch && toolMatch.index !== undefined) {
                  // Tool call found! Stop putting text into thought block.
                  const leaked = afterThink.substring(0, toolMatch.index).trim();
                  if (leaked) {
                    assistantMsg.thinkingContent += '\n\n' + leaked;
                  }
                  afterThink = afterThink.substring(toolMatch.index);
                  hideText = true; // Hide the actual tool call
                } else {
                  // No tool call yet. Put it all into the thought block temporarily.
                  const leaked = afterThink.trim();
                  if (leaked) {
                    assistantMsg.thinkingContent += '\n\n' + leaked;
                  }
                  afterThink = ''; // Clear it so it doesn't leak as content
                }
              } else if (!assistantMsg.thinkingContent) {
                // Buffering startup text to see if a <think> tag arrives
                if (textToDisplay.length < 50 && !textToDisplay.includes('<')) {
                  hideText = true;
                }
              }
              
              assistantMsg.content = hideText ? '' : afterThink.trim();
              
              // ── LIVE TOOL STREAMING DETECTION ──────────────────────────
              // Scan the raw accumulated text for file write/edit tool calls.
              // Only fires once the FULL filename is in the stream (</parameter> must be closed).
              // Also re-emits on every chunk to update the live +N line count.
              const FILE_WRITE_TOOLS = ['writeFile', 'createFile', 'write_to_file', 'editFile', 'replace_file_content', 'multi_replace_file_content'];
              const liveToolRegexes = [
                // <function=writeFile> ... <parameter=path>filename</parameter>  — requires closing tag
                /<function=([a-zA-Z0-9_-]+)>(?:[\s\S]*?)<parameter=(?:path|TargetFile|file)>\s*([^\n<]+?)\s*<\/parameter>/i,
                // call:writeFile{..."path":"filename"  — full quoted value required
                /call:([a-zA-Z0-9_]+)\s*\{[\s\S]*?"(?:path|TargetFile|file)"\s*:\s*"([^"]+)"/i,
                // {"name":"writeFile",..."path":"filename"  — full quoted value required
                /"name"\s*:\s*"([a-zA-Z0-9_]+)"[\s\S]*?"(?:path|TargetFile|file)"\s*:\s*"([^"]+)"/i,
              ];
              for (const rx of liveToolRegexes) {
                const m = fullResponseText.match(rx);
                if (m) {
                  const toolName = m[1];
                  const filePath = m[2].trim();
                  if (FILE_WRITE_TOOLS.includes(toolName)) {
                    const streamKey = `${toolName}:${filePath}`;
                    if (!(assistantMsg as any)._liveToolsEmitted) (assistantMsg as any)._liveToolsEmitted = new Set();
                    
                    // Try to read how many lines of content have streamed so far
                    const contentMatch = fullResponseText.match(/<parameter=(?:ReplacementContent|CodeContent|file_content|content)>\s*([\s\S]*?)(?:<\/parameter>|$)/i)
                      ?? fullResponseText.match(/"(?:ReplacementContent|CodeContent|file_content|content)"\s*:\s*"([\s\S]*?)(?:"|$)/i);
                    const liveContent = contentMatch ? contentMatch[1] : '';
                    const liveLines = liveContent ? liveContent.split('\n').length : 0;

                    if (!(assistantMsg as any)._liveToolsEmitted.has(streamKey)) {
                      // First time we see this complete filename — create the card
                      (assistantMsg as any)._liveToolsEmitted.add(streamKey);
                    }
                    // Always emit (not just once) so the line count updates every chunk
                    this.emit({
                      type: 'agent:tool-streaming',
                      data: {
                        messageId: assistantMsg.id,
                        toolName,
                        filePath,
                        liveLines,
                      }
                    });
                  }
                  break;
                }
              }

              this.emit({ 
                type: 'agent:streaming', 
                data: { 
                  text: chunk, 
                  fullText: fullResponseText,
                  parsedContent: assistantMsg.content,
                  thinkingContent: assistantMsg.thinkingContent
                } 
              });
            },
            onToolCall: (toolCall: ToolCall) => {
              const knownToolNames = getKnownToolNames(this.toolDefinitions);
              if (!isPlausibleToolName(toolCall.name, knownToolNames)) {
                console.error('[AgentLoop] BLOCKED invalid tool format from API:', toolCall.name);
                return;
              }
              
              // Handle structured tool calls from the API
              if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
              assistantMsg.toolCalls.push(toolCall);
              this.emit({ type: 'agent:tool-call', data: toolCall });
            },
            onError: (error: Error) => {
              console.log('[AgentLoop] API onError called, setting isStreaming to false');
              this.isStreaming = false;
              this.emit({ type: 'agent:error', data: { message: error.message } });
              reject(error);
            },
            onSuccess: (fullText: string) => {
              console.log('[AgentLoop] API onSuccess called, setting isStreaming to false');
              this.isStreaming = false;
              fullResponseText = fullText;
              
              let textToDisplay = fullResponseText;
              
              // 1. Extract thinking block
              const thinkStart = textToDisplay.indexOf('<think');
              let afterThink = textToDisplay;
              
              if (thinkStart !== -1) {
                const thinkEnd = textToDisplay.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  const closeBracket = textToDisplay.indexOf('>', thinkEnd);
                  if (closeBracket !== -1) {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart, closeBracket + 1);
                    afterThink = textToDisplay.substring(closeBracket + 1);
                  } else {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                    afterThink = '';
                  }
                } else {
                  assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                  afterThink = '';
                }
              } else if (textToDisplay.trim().startsWith('<') && textToDisplay.length < 20) {
                assistantMsg.thinkingContent = textToDisplay;
                afterThink = '';
              }
              
              // Only push leaked text into thought bubble if there's actually a tool call!
              const knownToolNames = getKnownToolNames(this.toolDefinitions);
              const parsedCalls = parseToolCallsFromText(afterThink, knownToolNames);
              if (parsedCalls.length > 0) {
                // Assign the parsed calls to assistantMsg
                if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
                for (const pc of parsedCalls) {
                  if (!isPlausibleToolName(pc.name, knownToolNames)) {
                    console.error('[AgentLoop] BLOCKED invalid tool format from text parser:', pc.name);
                    continue;
                  }
                  
                  // Generate an ID for the tool call
                  const id = 'call_' + Math.random().toString(36).substring(2, 9);
                  const newCall: ToolCall = {
                    id,
                    name: pc.name,
                    arguments: pc.arguments,
                    status: 'pending',
                    timestamp: Date.now()
                  };
                  assistantMsg.toolCalls.push(newCall);
                  this.emit({ type: 'agent:tool-call', data: newCall });
                }

                // Try to clean up the content by removing the tool call blocks
                const callIndex = afterThink.indexOf('call:');
                if (callIndex !== -1) {
                  const leaked = afterThink.substring(0, callIndex).trim();
                  if (leaked) {
                    assistantMsg.thinkingContent += '\n\n' + leaked;
                  }
                  afterThink = '';
                } else {
                  // Fallback match
                  const toolMatch = afterThink.match(/```(?:json)?|<function=|\[TOOL:|call:|\{/i);
                  if (toolMatch && toolMatch.index !== undefined) {
                    const leaked = afterThink.substring(0, toolMatch.index).trim();
                    if (leaked) {
                      assistantMsg.thinkingContent += '\n\n' + leaked;
                    }
                    afterThink = '';
                  } else {
                    const leaked = afterThink.trim();
                    if (leaked) {
                      assistantMsg.thinkingContent += '\n\n' + leaked;
                    }
                    afterThink = '';
                  }
                }
              }
              
              assistantMsg.content = afterThink.trim();
              assistantMsg.isStreaming = false;
              assistantMsg.durationMs = Date.now() - startTime;
              assistantMsg.tokensUsed = estimateTokens(fullText);
              
              this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
              resolve();
            },
            checkIsStreaming: () => this.isStreaming,
            signal: this.abortController?.signal,
          });
        });

        // ── Phase 1: Native Tool execution isolation ────────
        // No text fallback parsing needed here; api.ts handles native tool calls
        // and returns them directly in assistantMsg.toolCalls.
        
        let forceRetry = false;
        const hasToolCalls = assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0;
        
        // ── Detect duplicate tool call loops ───────────────────────────────────
        if (hasToolCalls) {
          // Only consider write operations and dangerous tools for duplicate detection
          // Legitimate repeated reads (listDirectory, readFile) and subagent spawning are allowed
          const writeTools = assistantMsg.toolCalls!.filter(tc =>
            !['listDirectory', 'readFile', 'grepSearch', 'findByName', 'searchFiles', 'gitStatus', 'gitDiff', 'invokeSubagent'].includes(tc.name)
          );

          if (writeTools.length > 0) {
            const currentSignature = JSON.stringify(writeTools.map(tc => ({ name: tc.name, args: tc.arguments })));

            if (currentSignature === this.state.lastToolSignature) {
              this.state.consecutiveDuplicates = (this.state.consecutiveDuplicates || 0) + 1;

              if (this.state.consecutiveDuplicates >= 3) {
                console.warn('[AgentLoop] Detected duplicate tool call loop (3+ repeats). Intercepting.');

                assistantMsg.isHidden = true; // Hide the repeating tool call

                const errorMsg = createUserMessage(
                  `[SYSTEM ERROR] You have repeated the exact same tool call 3 times. You are stuck in a loop. STOP using this tool. Re-evaluate your strategy and try a COMPLETELY DIFFERENT approach. If you were trying to read files, use readFile instead. If you were trying to create tasks, check if they already exist.`
                );
                errorMsg.isHidden = true;
                updatedMessages.push(errorMsg);
                this.emit({ type: 'agent:message-added', data: errorMsg });

                forceRetry = true;
              }
            } else {
              this.state.consecutiveDuplicates = 0;
            }
            this.state.lastToolSignature = currentSignature;
          }
        }

        // Reset consecutive errors if it successfully made a tool call (or gave text)
        if (hasToolCalls) {
          this.state.consecutiveErrors = 0;
        }

        // ── Check if we need to force a retry without executing tools ───
        if (forceRetry) {
          // Note: updatedMessages is already mutated and used by the next iteration's buildContext
          continue;
        }

        // Notify UI immediately that this message now has tool calls (real-time display)
        this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });

        // Create tasks for each tool call
        if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
          this.createTasksFromToolCalls(assistantMsg.toolCalls);
        }

        // ── Process tool calls ─────────────────────────────────────────
        if (
          assistantMsg.toolCalls &&
          assistantMsg.toolCalls.length > 0 &&
          this.toolExecutor &&
          this.state.isRunning
        ) {
          // ── Classify tools: read-only (all can run in parallel) vs write/side-effect ──
          // Expanded pool: any non-mutating tool is safe to parallelize.
          const READ_ONLY_TOOLS = new Set([
            'listDirectory', 'readFile', 'grepSearch', 'findByName',
            'searchFiles', 'codeAnalysis', 'webSearch', 'readUrl',
            'gitStatus', 'gitDiff', 'commandStatus',
          ]);
          const readOnlyTools = assistantMsg.toolCalls.filter(tc => READ_ONLY_TOOLS.has(tc.name));
          const writeTools    = assistantMsg.toolCalls.filter(tc => !READ_ONLY_TOOLS.has(tc.name));

          // Execute read-only tools in parallel for efficiency
          const executeToolInternal = async (toolCall: any) => {
            if (!this.state.isRunning) return;

            toolCall.status = 'running';
            this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });

            this.state.status = `Executing ${toolCall.name}...`;
            this.state.currentToolCall = toolCall;
            this.emit({ type: 'agent:tool-executing', data: toolCall });

            try {
              // SECURITY INTERCEPTOR: Check if tool needs manual UI approval
              let isApproved = true;
              if (SecurityInterceptor.requiresApproval(toolCall)) {
                this.state.status = `Awaiting your approval for ${toolCall.name}...`;
                this.emit({ type: 'agent:tool-approval-needed', data: toolCall });
                
                // Suspend execution and wait for UI event
                isApproved = await new Promise<boolean>((resolve) => {
                  const handler = (e: any) => {
                    if (e.detail.toolCallId === toolCall.id) {
                      window.removeEventListener('tool-approval-response', handler);
                      resolve(e.detail.approved);
                    }
                  };
                  window.addEventListener('tool-approval-response', handler);
                });
              }

              let result: ToolResult;
              if (isApproved) {
                // Check if this is a coding operation
                const isCodingOperation = toolCall.name === 'writeFile' || toolCall.name === 'createFile' || toolCall.name === 'editFile';
                const filePath = toolCall.arguments?.path || toolCall.arguments?.TargetFile || '';

                if (isCodingOperation && filePath) {
                  this.emit({ 
                    type: 'agent:coding-started', 
                    data: { 
                      fileName: filePath.split('/').pop() || filePath,
                      filePath,
                      toolName: toolCall.name
                    }
                  });
                }

                this.state.status = `Executing ${toolCall.name}...`;
                result = await this.toolExecutor(toolCall);
                
                if (result.success) {
                  this.executedToolNames.add(toolCall.name);
                  
                  // Emit coding progress for successful file operations
                  if (isCodingOperation && filePath) {
                    const contentStr = typeof toolCall.arguments?.content === 'string' ? toolCall.arguments.content : '';
                    const addedLines = contentStr ? contentStr.split('\n').length : 0;
                    this.emit({ 
                      type: 'agent:coding-progress', 
                      data: { 
                        fileName: filePath.split('/').pop() || filePath,
                        filePath,
                        added: addedLines,
                        removed: 0,
                        toolName: toolCall.name
                      }
                    });
                    
                    this.emit({ 
                      type: 'agent:coding-complete', 
                      data: { 
                        fileName: filePath.split('/').pop() || filePath,
                        filePath,
                        toolName: toolCall.name
                      }
                    });
                  }
                }
              } else {
                result = { success: false, output: 'Tool execution was REJECTED by the user.' };
              }

              toolCall.result = result;
              toolCall.status = result.success ? 'completed' : 'error';
              toolCall.durationMs = Date.now() - toolCall.timestamp;

              // Track successful file writes
              if (result.success && (toolCall.name === 'writeFile' || toolCall.name === 'createFile' || toolCall.name === 'editFile')) {
                this.successfulFileWrites++;
              }

              // Update the associated task status
              this.updateTaskFromToolCall(toolCall, result);

              this.emit({ type: 'agent:tool-result', data: { toolCall, result } });

              // Add tool result message for next iteration
              const toolMsg = createToolMessage(toolCall.id, toolCall.name, result);
              updatedMessages.push(toolMsg);
              this.emit({ type: 'agent:message-added', data: toolMsg });

            } catch (error: any) {
              const errorMessage = error.message || String(error);
              
              // Intelligent error recovery based on error type
              let recoverySuggestion = '';
              if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
                recoverySuggestion = ' The file or directory may not exist. Try using listDirectory to verify the path.';
              } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
                recoverySuggestion = ' Permission denied. Check if you have the necessary access rights.';
              } else if (errorMessage.includes('syntax') || errorMessage.includes('parse')) {
                recoverySuggestion = ' There may be a syntax error. Check the file contents and try again.';
              }

              toolCall.status = 'error';
              toolCall.result = {
                success: false,
                output: `Tool execution failed: ${errorMessage}${recoverySuggestion}`,
              };
              toolCall.durationMs = Date.now() - toolCall.timestamp;

              this.emit({
                type: 'agent:tool-result',
                data: {
                  toolCall,
                  result: toolCall.result,
                },
              });

              // Still add error result so LLM can try to recover
              const toolMsg = createToolMessage(toolCall.id, toolCall.name, toolCall.result);
              updatedMessages.push(toolMsg);
              this.emit({ type: 'agent:message-added', data: toolMsg });

              // Add recovery hint to help LLM recover
              if (recoverySuggestion) {
                const hintMsg = createUserMessage(
                  `[SYSTEM]: Error recovery hint: ${recoverySuggestion} Consider using listDirectory to explore the structure before retrying.`
                );
                updatedMessages.push(hintMsg);
              }
            }
          };

          // Run read-only tools concurrently
          await Promise.all(readOnlyTools.map(executeToolInternal));
          
          // Run sub-agent invocations concurrently (they are asynchronous triggers)
          const invokeSubagentTools = writeTools.filter(tc => tc.name === 'invokeSubagent');
          const actualWriteTools = writeTools.filter(tc => tc.name !== 'invokeSubagent');

          await Promise.all(invokeSubagentTools.map(executeToolInternal));

          // ── Smart parallel execution for independent write tools ──────────────────
          // Use ParallelToolExecutor's dependency analysis to group tools by file
          // conflicts. Tools in the same batch target different files and are safe
          // to run concurrently. Batches are run sequentially (later batches may
          // depend on earlier ones, e.g. editFile after createFile on the same path).
          if (this.parallelExecutor && actualWriteTools.length > 1) {
            const batches = this.parallelExecutor.getExecutionBatches(actualWriteTools as any);
            console.log(`[AgentLoop] Parallel write execution: ${actualWriteTools.length} tools → ${batches.length} batch(es)`, batches.map(b => b.map(t => t.name)));
            for (const batch of batches) {
              if (batch.length === 1) {
                await executeToolInternal(batch[0]);
              } else {
                // Multiple independent tools — run in parallel
                await Promise.all(batch.map(executeToolInternal));
              }
            }
          } else {
            // Fallback: single tool or no parallel executor
            for (const writeTool of actualWriteTools) {
              await executeToolInternal(writeTool);
            }
          }

          this.state.currentToolCall = undefined;

          // Check if ALL tool calls in this iteration were duplicates
          const allDuplicates = assistantMsg.toolCalls.every(
            (tc) => tc.result?.output?.toString().startsWith('[Already called]')
          );
          
          if (allDuplicates) {
            this.state.consecutiveDuplicates = (this.state.consecutiveDuplicates || 0) + 1;
          } else {
            this.state.consecutiveDuplicates = 0;
          }

          if (this.state.consecutiveDuplicates >= 2) {
            console.warn('[AgentLoop] Breaking loop due to repeated duplicate tool calls.');
            continueLoop = false;
            const doneMsg = createAssistantMessage(this.config.model);
            doneMsg.content = 'I have completed my tasks and reviewed the available information.';
            doneMsg.isStreaming = false;
            updatedMessages.push(doneMsg);
          } else {
            // Check if we invoked sub-agents. If so, force sleep to prevent restless polling loops.
            const invokedSubagents = assistantMsg.toolCalls.some(tc => tc.name === 'invokeSubagent');
            if (invokedSubagents) {
              console.log('[AgentLoop] Agent invoked subagents. Forcing sleep to prevent polling loop.');
              // The notifySubagentSpawned() is called synchronously in invokeSubagent handler
              // So activeSubagentCount should already be incremented
              console.log(`[AgentLoop] activeSubagentCount after invokeSubagent: ${this.activeSubagentCount}`);
              // If count is still 0, it means the tool didn't call notifySubagentSpawned
              // This is a bug - force sleep anyway to prevent premature termination
              if (this.activeSubagentCount === 0) {
                console.warn('[AgentLoop] BUG: activeSubagentCount is 0 after invokeSubagent! Forcing increment.');
                this.activeSubagentCount = assistantMsg.toolCalls.filter(tc => tc.name === 'invokeSubagent').length;
              }
              continueLoop = false;
            } else {
              // Continue loop to let LLM process tool results
              continueLoop = true;
            }
          }
        } else {
          // No tool calls — LLM gave a pure text-only response.
          if (forceRetry) {
            continueLoop = true;
          } else {
            // Check if there are still pending tasks in THIS conversation that haven't been delegated
            const convId = this.state.conversationId;
            const convTasks = convId ? getTasksForConversation(convId) : [];
            
            // Find tasks that are ready to execute (dependencies satisfied, not delegated, not completed)
            // Rebuild graph from fresh task store data so status is current,
            // then use TaskGraph.getExecutableTasks() for proper dependency-aware scheduling.
            const freshTasks = convId ? getTasksForConversation(convId) : [];
            const freshGraph = new TaskGraph(freshTasks);
            const readyTasks = freshGraph.getExecutableTasks().filter(t => !t.delegatedTo);
            
            const hasUnfinishedWork = readyTasks.length > 0 && this.activeSubagentCount === 0;
            
            // Only nudge ONCE to avoid infinite nudge loops
            if (hasUnfinishedWork && !this.state.hasNudgedForDelegation && this.state.currentIteration < this.config.maxAgentIterations - 1) {
              console.log(`[AgentLoop] Text-only response but ${readyTasks.length} tasks are ready for execution. Nudging agent to delegate.`);
              this.state.hasNudgedForDelegation = true;
              
              // List the ready tasks in the nudge message
              const taskList = readyTasks.slice(0, 5).map(t => `- ${t.title} (ID: ${t.id})`).join('\n');
              const nudgeMsg = createUserMessage(
                `[SYSTEM] You output text but did NOT call any tools or invoke sub-agents. There are ${readyTasks.length} tasks ready for execution:\n${taskList}\n\nYou MUST use your tools to actually complete these tasks. For each task:\n1. Create the necessary files using writeFile/createFile\n2. Then invoke sub-agents using invokeSubagent with the taskId\n\nDo not describe what you will do — actually call the tools NOW.`
              );
              nudgeMsg.isHidden = true;
              updatedMessages.push(nudgeMsg);
              this.emit({ type: 'agent:message-added', data: nudgeMsg });
              continueLoop = true;
            } else {
              console.log('[AgentLoop] Text-only response, stopping loop naturally.');
              continueLoop = false;
            }
          }
        }

        // ── Token Optimization: Update last sent index for delta injection ──
        // After processing this iteration, mark all current messages as "sent"
        // so next iteration only sends new messages in full, compressing old ones
        this.lastSentMessageIndex = updatedMessages.length;
        
        // ── Token Optimization: Mark tool results as consumed ───────────────
        // Tool results that were sent in previous iterations should be marked as consumed
        // so they can be compressed more aggressively in future iterations
        for (const msg of updatedMessages) {
          if (msg.role === 'tool' && !msg.wasConsumed) {
            // Mark as consumed if it was sent before this iteration
            const msgIndex = updatedMessages.indexOf(msg);
            if (msgIndex < this.lastSentMessageIndex - 2) { // -2 to account for assistant + tool result pair
              msg.wasConsumed = true;
            }
          }
        }

        // ── PERSISTENT CONNECTION LOGIC ────────────────────────────────
        // Only sleep (keep connection alive) when we have active sub-agents or background tasks running.
        // Otherwise emit agent:done and cleanly terminate.
        const hasActiveSubagents = this.activeSubagentCount > 0;

        // Wait, what if there is a background task running?
        // We will listen for a custom event 'background-task-complete'
        const hasActiveBackgroundTasks = false; // We can track this if needed, for now we will just use the event listener while asleep

        // Fix loop termination signal conflict: ensure we sleep if sub-agents were just invoked
        // even if continueLoop was set to false. This prevents the race condition where the loop
        // exits before the sub-agent count is incremented.
        const shouldSleep = !continueLoop && this.state.isRunning && (hasActiveSubagents || (assistantMsg.toolCalls?.some(tc => tc.name === 'invokeSubagent')));

        if (shouldSleep) {
          this.state.status = 'sleeping';
          this.state.phase = 'idle';
          this.emit({ type: 'agent:sleeping' });
          
          this.isSleeping = true;
          
          await new Promise<void>((resolve) => {
            this.resolveWakeup = resolve;
            
            let timeoutId: NodeJS.Timeout | null = null;
            
            // Abort listener for sleep phase
            const abortListener = () => {
              if (this.resolveWakeup) {
                this.isSleeping = false;
                this.resolveWakeup();
                this.resolveWakeup = null;
              }
              if (timeoutId) clearTimeout(timeoutId);
            };
            
            if (this.abortController) {
              this.abortController.signal.addEventListener('abort', abortListener);
            }

            // Event listener for background task completion
            const taskCompleteListener = (e: any) => {
              if (this.isSleeping && this.resolveWakeup) {
                console.log('[AgentLoop] Waking up due to background-task-complete event.');
                if (e.detail?.result) {
                  // Append result to pending messages
                  const toolMsg = createToolMessage(e.detail.taskId, 'manageTask', { success: true, output: e.detail.result });
                  this.pendingMessages.push(toolMsg);
                }
                this.isSleeping = false;
                this.resolveWakeup();
                this.resolveWakeup = null;
                if (timeoutId) clearTimeout(timeoutId);
              }
            };
            window.addEventListener('background-task-complete', taskCompleteListener);

            // Timeout safety net (5 minutes), only wakes if no subagents are active
            timeoutId = setTimeout(() => {
              window.removeEventListener('background-task-complete', taskCompleteListener);
              if (this.abortController) {
                this.abortController.signal.removeEventListener('abort', abortListener);
              }
              if (this.isSleeping && this.resolveWakeup) {
                if (this.activeSubagentCount > 0) {
                  console.log('[AgentLoop] Sleep timeout reached, but subagents are still active. Staying asleep...');
                  return;
                }
                console.log('[AgentLoop] Sleep timeout reached and no subagents active, waking up...');
                this.isSleeping = false;
                this.resolveWakeup();
                this.resolveWakeup = null;
              }
            }, 300000); // 5 minutes
          });
          
          // Agent woke up — collect any messages that arrive in a short batch window
          // before triggering the next LLM call. This merges results from multiple
          // sub-agents that finish near-simultaneously into a single LLM round-trip
          // instead of N separate round-trips.
          if (this.state.isRunning && !this.abortController?.signal.aborted) {
            continueLoop = true;
            this.state.status = 'waking up';

            // 300 ms batch window: accumulate any additional sub-agent messages
            await new Promise<void>(r => setTimeout(r, 300));

            if (this.pendingMessages.length > 0) {
              updatedMessages.push(...this.pendingMessages);
              this.pendingMessages = [];
            }
            this.emit({ type: 'agent:wakeup' });
          } else {
            continueLoop = false;
          }
        }

        // ── PHASE 5: VALIDATION (check if goal is satisfied) ───────────
        if (!continueLoop || this.state.currentIteration > 1) {
          const goalSatisfied = await this.validateGoalSatisfaction(updatedMessages);
          if (goalSatisfied) {
            continueLoop = false;
          }
        }
      }

      // ── Finalize ─────────────────────────────────────────────────────
      this.state.isRunning = false;
      this.state.status = 'done';
      this.state.phase = 'done';
      this.state.elapsedMs = Date.now() - (this.state.startTime || Date.now());
      this.emit({
        type: 'agent:done',
        data: {
          reason: 'completed',
          iterations: this.state.currentIteration,
          elapsedMs: this.state.elapsedMs,
        },
      });
    } catch (error: any) {
      this.state.isRunning = false;
      this.state.status = 'error';

      if (error.name === 'AbortError') {
        this.emit({ type: 'agent:done', data: { reason: 'user_cancelled' } });
      } else {
        this.emit({ type: 'agent:error', data: { message: error.message } });
      }
    }

    return updatedMessages;
  }

  private emit(event: AgentEvent): void {
    try {
      this.eventCallback(event);
      // Also dispatch to window for global listeners
      window.dispatchEvent(new CustomEvent(event.type, { detail: event.data }));
    } catch (e) {
      console.error('[AgentLoop] Event callback error:', e);
    }
  }

  /** Create tasks from tool calls */
  private createTasksFromToolCalls(toolCalls: ToolCall[]): void {
    for (const toolCall of toolCalls) {
      const taskTitle = `Execute ${toolCall.name}`;
      const taskDescription = `Tool call with arguments: ${JSON.stringify(toolCall.arguments).substring(0, 100)}...`;
      
      const task = createTask({
        title: taskTitle,
        description: taskDescription,
        priority: 'medium',
        tags: ['tool-execution'],
        metadata: { toolCallId: toolCall.id },
      });

      // Store the task ID in the tool call for later updates
      (toolCall as any).taskId = task.id;
    }
  }

  /** Update task status based on tool call result */
  private updateTaskFromToolCall(toolCall: ToolCall, result: ToolResult): void {
    const taskId = (toolCall as any).taskId;
    if (taskId) {
      updateTask(taskId, {
        status: result.success ? 'completed' : 'failed',
      });
    }
  }

  /** Detect ambiguities in user request that need clarification */
  private async detectAmbiguities(userMessage: string): Promise<string | null> {
    // Simple heuristic-based ambiguity detection
    // Removed overly broad patterns that matched normal coding requests
    const ambiguityPatterns = [
      { pattern: /\b(it|this|that)\b/gi, message: 'What specifically are you referring to?' },
      { pattern: /\b(fix|repair|debug)\b/gi, message: 'What specific issue or error are you encountering?' },
      { pattern: /\b(improve|optimize|enhance)\b/gi, message: 'What specific metrics or aspects should be improved?' },
    ];

    // Only trigger for very short, vague messages (less than 5 words)
    if (userMessage.split(' ').length >= 5) {
      return null;
    }

    for (const { pattern, message } of ambiguityPatterns) {
      if (pattern.test(userMessage)) {
        return message;
      }
    }

    return null;
  }

  /** Plan execution by creating a task graph from the goal */
  private async planExecution(messages: AgenticMessage[]): Promise<TaskGraph> {
    // Use existing tasks from taskStore if they exist (created by createTodoListTasks)
    // Otherwise create a minimal planning task
    const convId = this.state.conversationId;
    const existingTasks = convId ? getTasksForConversation(convId) : [];
    
    if (existingTasks.length > 0) {
      // Use the tasks already created by the LLM via createTodoListTasks
      // Convert taskStore tasks to TaskGraph format
      return new TaskGraph(existingTasks);
    }

    // Fallback: create initial planning task with conversationId for proper tracking
    const planTask = createTask({
      title: 'Plan execution approach',
      description: 'Analyze requirements and create execution plan',
      priority: 'high',
      tags: ['planning'],
      conversationId: this.state.conversationId,
      projectId: this.projectContext?.rootPath,
    });

    // Create TaskGraph with the planning task
    return new TaskGraph([planTask]);
  }

  /** Reflection phase - evaluate progress and strategy */
  private async reflectOnProgress(messages: AgenticMessage[], taskGraph: TaskGraph): Promise<void> {
    this.state.phase = 'reflecting';
    this.state.status = 'Reflecting on progress...';
    this.emit({ type: 'agent:reflection-started' });

    const stats = taskGraph.getStats();
    const progress = stats.completedTasks / (stats.totalTasks || 1) * 100;
    const newProgress = Math.round(progress);

    // Check if stuck (no progress for multiple iterations)
    // Compare new progress with previous progress, not with itself
    if (newProgress === this.state.progress && this.state.currentIteration > 3) {
      this.state.stuckCount++;
    } else {
      this.state.stuckCount = 0;
    }

    // Update state progress after comparison
    this.state.progress = newProgress;

    // If stuck too many times, consider alternative approach
    if (this.state.stuckCount >= 3) {
      this.emit({ type: 'agent:error', data: { 
        message: 'Agent appears stuck. Considering alternative approach...' 
      }});
    }

    // Update progress
    this.emit({ type: 'agent:progress-update', data: { 
      progress: this.state.progress,
      completedTasks: stats.completedTasks,
      totalTasks: stats.totalTasks,
    }});

    this.emit({ type: 'agent:reflection-complete' });
  }

  /** Validate if goal has been satisfied */
  private async validateGoalSatisfaction(messages: AgenticMessage[]): Promise<boolean> {
    // Check if all tasks in taskStore for this conversation are completed
    const convId = this.state.conversationId;
    if (!convId) return false;

    const convTasks = getTasksForConversation(convId);
    if (convTasks.length === 0) return false; // No tasks to track

    const incompleteTasks = convTasks.filter(t => t.status !== 'completed');
    return incompleteTasks.length === 0;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  projectContext?: ProjectContext;
  toolExecutor?: (toolCall: ToolCall) => Promise<ToolResult>;
  toolDefinitions?: any[];
  conversationId?: string;
  agentRole?: 'orchestrator' | 'subagent';
  billingSession?: TokenBillingSession;
}

/** Create a new AgentLoop with current configuration */
export function createAgentLoop(
  eventCallback: AgentEventCallback,
  options?: {
    projectId?: string;
  } & AgentLoopOptions
): AgentLoop {
  const config = getAIConfig(options?.projectId);
  return new AgentLoop(config, eventCallback, {
    projectContext: options?.projectContext,
    toolExecutor: options?.toolExecutor,
    toolDefinitions: options?.toolDefinitions,
    conversationId: options?.conversationId,
    agentRole: options?.agentRole,
    billingSession: options?.billingSession,
  });
}

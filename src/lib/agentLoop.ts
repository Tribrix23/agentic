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
import { isFileTool, getFileOperation } from './fileActivity';
import { buildContext, buildGpt56ToolPrompt, buildXmlToolPrompt, ProjectContext } from './contextBuilder';
import { buildPlanModeContract } from './tools/planModePolicy';
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
import { AgentRuntimeError, throwIfAborted } from './agent/runtimeErrors';
import { ProviderStreamAssembler } from './agent/streamAssembler';
import { normalizeAssistantTurn } from './agent/turnNormalizer';
import type { CoordinatedRunContext } from './agent/runCoordinator';
import { SecurityInterceptor } from './SecurityInterceptor';
import { getDurableTasksForConversation } from './taskStore';
import { TaskGraph } from './taskGraph';
import { ActionScheduler } from './agent/actionScheduler';
import { calculateLineChanges, IncrementalToolCallParser } from './incrementalToolCallParser';
import type { StreamingFileToolCall } from './incrementalToolCallParser';
import { parseMcpToolCalls } from './mcp/xml';
import { toMcpAlias } from './mcp/renderer';
import {
  buildSequentialPlanningContract,
  hasSequentialThinkingTool,
  isSequentialThinkingTool,
  isToolBlockedBeforeStructuredPlan,
  normalizeSequentialThinkingArguments,
  requiresStructuredPlanning,
  SequentialThoughtTrace,
} from './sequentialThinking';

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
  runId?: string;
  conversationId?: string;
  turnId?: string;
}

export type AgentEventCallback = (event: AgentEvent) => void;

function toLineCount(content: string): number {
  return content ? content.replace(/\r\n/g, '\n').split('\n').length : 0;
}

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



  if (HTML_TAG_NAMES.has(name.toLowerCase())) {
    return false;
  }

  // Allow lowercase tool names (e.g. "bash" aliases)
  return true;
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
export function parseToolCallsFromText(text: string, knownToolNames?: Set<string>): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;

  const mcpCalls = parseMcpToolCalls(text);
  for (const call of mcpCalls) {
    const name = toMcpAlias(call.server, call.tool);
    if (isPlausibleToolName(name, knownToolNames)) toolCalls.push({ name, arguments: call.arguments });
  }
  if (toolCalls.length > 0) return toolCalls;

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
      else if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
        try { val = JSON.parse(val); } catch (e) { /* ignore */ }
      }
      args[paramMatch[1].trim()] = val;
    }

    // Some models follow the older prompt contract and emit <question>...</question>
    // instead of <parameter=question>...</parameter>. Handle that form explicitly so
    // askUser cannot be mistaken for a text-only clarification response.
    if (Object.keys(args).length === 0) {
      const standardXmlRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/gi;
      let xmlMatch;
      while ((xmlMatch = standardXmlRegex.exec(argsStr)) !== null) {
        let val: any = xmlMatch[2].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        else if ((val.startsWith('{') && val.endsWith('}')) || (val.startsWith('[') && val.endsWith(']'))) {
          try { val = JSON.parse(val); } catch (e) { /* ignore */ }
        }
        args[xmlMatch[1].trim()] = val;
      }
    }

    if (name === 'askUser' && typeof args.question !== 'string') {
      // A partially streamed or malformed askUser call must not be executed with
      // an empty question, but it should still be surfaced as a parsed call so
      // the agent can correct its format on the next iteration.
      const questionMatch = /<question\s*>([\s\S]*?)<\/question\s*>/i.exec(argsStr);
      if (questionMatch) args.question = questionMatch[1].trim();
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
        } catch (e) { }
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
    } catch (e) { }
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
        } catch (e) { }
      }
      si = text.indexOf('{', si + 1);
    }
  }

  return toolCalls;
}

export function isStandaloneToolArgumentsJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return false;
    if (parsed.name || parsed.tool_call || parsed.function) return false;
    const keys = Object.keys(parsed);
    return keys.includes('path') && keys.every(key => [
      'path', 'startLine', 'endLine', 'search', 'replace', 'operation',
      'expectedMatches', 'content', 'artifactMetadata',
    ].includes(key));
  } catch {
    return false;
  }
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
  // New bracketed historical context format echoes
  cleaned = cleaned.replace(/^\[HISTORICAL CONTEXT[^\]]*\].*$/gim, '');
  cleaned = cleaned.replace(/^\[PAST_ACTION:[^\]]*\].*$/gim, '');
  // HTML comment format echoes (new system_history format)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/gi, '');
  // Old system_history format echoes (XML)
  cleaned = cleaned.replace(/<system_history>[\s\S]*?<\/system_history>/gi, '');
  cleaned = cleaned.replace(/<system_history_tool[^>]*>[\s\S]*?<\/system_history_tool>/gi, '');
  // XML past_action / past_tool_result — match even if malformed/unclosed
  cleaned = cleaned.replace(/<past_action[\s\S]*?(?:<\/past_action>|$)/gi, '');
  cleaned = cleaned.replace(/<past_tool_result[\s\S]*?(?:<\/past_tool_result>|$)/gi, '');
  // Orphaned closing XML tags from mixed format echoes
  cleaned = cleaned.replace(/<\/(?:past_action|past_tool_result|arg_value|arg_key|tool_call|system_history|system_history_tool)>/gi, '');
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
  private toolExecutor: ((toolCall: ToolCall, signal: AbortSignal, context?: { userMessageId?: string; conversationId?: string; projectRoot?: string; interactionMode?: 'ask' | 'plan' | 'agent' }) => Promise<ToolResult>) | null = null;
  private toolDefinitions: any[] = [];
  private executedToolNames: Set<string> = new Set();
  private successfulFileWrites: number = 0;
  private planningRequired = false;
  private sequentialThoughts = new SequentialThoughtTrace();
  private options?: AgentLoopOptions;
  /** Executes model actions in canonical emitted order. */
  private actionScheduler?: ActionScheduler;

  // Token optimization: cache static content
  private cachedSystemPrompt?: string;
  private cachedSystemPromptProtocol?: 'native' | 'xml';
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
    this.userMessageId = options?.userMessageId;
  }

  private conversationId?: string;

  private resolveWakeup: ((value: void | PromiseLike<void>) => void) | null = null;
  private isSleeping = false;
  private pendingMessages: AgenticMessage[] = [];
  public activeSubagentCount = 0;
  private isStreaming = false; // Dedicated flag to track active streaming
  private activeRunContext: CoordinatedRunContext | null = null;
  private userMessageId?: string;

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
  updateTools(definitions: any[], executor: (toolCall: ToolCall, signal: AbortSignal) => Promise<ToolResult>): void {
    this.toolDefinitions = definitions;
    this.toolExecutor = executor;
    this.actionScheduler = new ActionScheduler();
  }

  /**
   * Run the agent loop for a user message.
   *
   * @param messages - The full conversation history (including the new user message)
   * @returns Updated messages array with all agent responses appended
   */
  async run(messages: AgenticMessage[]): Promise<AgenticMessage[]> {
    if (this.state.isRunning) {
      throw new AgentRuntimeError('validation', 'This agent loop is already running.', 'LOOP_ACTIVE');
    }
    this.abortController = new AbortController();
    this.actionScheduler = new ActionScheduler({ signal: this.abortController.signal });
    this.sequentialThoughts = new SequentialThoughtTrace();
    this.planningRequired = false;
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

    const runId = this.options?.runId;
    const turnId = this.options?.turnId || `turn:${Date.now()}`;
    if (runId && this.conversationId) {
      this.activeRunContext = {
        runId,
        conversationId: this.conversationId,
        signal: this.abortController.signal,
        nextTurn: () => `turn:${Date.now()}`,
        getSnapshot: () => ({ runId, conversationId: this.conversationId!, turnId, phase: 'executing', iteration: this.state.currentIteration, startedAt: this.state.startTime || Date.now(), updatedAt: Date.now() }),
        transition: () => this.activeRunContext!.getSnapshot(),
        emit: () => true,
      };
    }

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
        this.planningRequired = this.options?.agentRole !== 'subagent'
          && hasSequentialThinkingTool(this.toolDefinitions)
          && requiresStructuredPlanning(userMessage.content);

        // Check for ambiguities that need clarification
        const clarification = await this.detectAmbiguities(userMessage);
        if (clarification) {
          this.state.needsClarification = true;
          this.state.clarificationQuestion = clarification;
          this.emit({ type: 'agent:clarification-needed', data: { question: clarification } });

          // The heuristic already determined that clarification is required. Do
          // not merely emit an informational event and continue: that leaves the
          // model free to describe asking a question without actually invoking
          // the user-facing askUser tool.
          if (this.toolExecutor) {
            const clarificationCall: ToolCall = {
              id: `ask_${Math.random().toString(36).substring(2, 9)}`,
              name: 'askUser',
              arguments: { question: clarification },
              status: 'pending',
              timestamp: Date.now(),
              agentKind: this.options?.agentRole === 'subagent' ? 'subagent' : 'main',
              agentRole: this.options?.agentRole,
            };
            const clarificationAssistant = createAssistantMessage(this.config.model);
            clarificationAssistant.toolCalls = [clarificationCall];
            clarificationAssistant.isHidden = true;
            updatedMessages.push(clarificationAssistant);
            this.emit({ type: 'agent:message-added', data: clarificationAssistant });
            this.emit({ type: 'agent:tool-call', data: clarificationCall });

            clarificationCall.status = 'running';
            this.emit({ type: 'agent:tool-executing', data: clarificationCall });
            const result = await this.toolExecutor(clarificationCall, this.abortController.signal, { userMessageId: this.userMessageId });
            clarificationCall.result = result;
            clarificationCall.status = result.success ? 'completed' : 'error';
            clarificationCall.durationMs = Date.now() - clarificationCall.timestamp;
            const clarificationResult = createToolMessage(clarificationCall.id, 'askUser', result);
            updatedMessages.push(clarificationResult);
            this.emit({ type: 'agent:tool-result', data: { toolCall: clarificationCall, result } });
            this.emit({ type: 'agent:message-added', data: clarificationResult });
            this.state.needsClarification = false;
            this.state.clarificationQuestion = undefined;
          }
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

      const taskGraph = await this.planExecution();
      this.emit({
        type: 'agent:planning-complete', data: {
          taskCount: taskGraph.getStats().totalTasks,
          criticalPath: taskGraph.getCriticalPath(),
          structured: this.sequentialThoughts.isComplete(),
          awaitingStructuredPlan: this.planningRequired && !this.sequentialThoughts.isComplete(),
        }
      });

      // ── PHASE 3: EXECUTION ───────────────────────────────────────────────
      this.state.phase = 'executing';
      this.state.status = 'Executing tasks...';

      // ── Token Optimization: Cache static system prompt + project context ──
      // This avoids rebuilding the ~1800-2500 token system prompt on every iteration
      const toolProtocol = this.options?.toolProtocol || 'native';
      const systemPromptText = buildSystemPrompt(this.config, this.options?.interactionMode);
      let fullSystemPrompt = systemPromptText;

      if (this.planningRequired) {
        fullSystemPrompt += buildSequentialPlanningContract();
      }
      if (this.options?.interactionMode === 'plan') {
        fullSystemPrompt += '\n' + buildPlanModeContract();
      }
      if (this.options?.executionPlanInstruction) {
        fullSystemPrompt += `\n<implementation_execution>\n${this.options.executionPlanInstruction}\n</implementation_execution>`;
      }

      // The cached prompt is passed back into buildContext on every iteration.
      // Therefore the model-specific tool contract must be added while creating
      // the cache; buildContext cannot add it later when a cached prompt exists.
      if (toolProtocol !== 'xml' &&
        this.toolDefinitions.length > 0 &&
        (this.config.model.toLowerCase().includes('gpt-5.6') || this.config.model.toLowerCase().includes('gpt56'))
      ) {
        fullSystemPrompt += '\n' + buildGpt56ToolPrompt(this.toolDefinitions);
      }
      if (toolProtocol === 'xml' && this.toolDefinitions.length > 0) {
        fullSystemPrompt += '\n' + buildXmlToolPrompt(this.toolDefinitions);
      }

      if (this.projectContext) {
        // Inject skills block FIRST so the AI always knows what skills are available
        if (this.projectContext.agentSkillsBlock) {
          fullSystemPrompt += '\n' + this.projectContext.agentSkillsBlock;
        }

        // Only add project-specific lines when there is a real project open
        if (this.projectContext.rootPath) {
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
      }

      if (this.cachedSystemPromptProtocol !== toolProtocol) this.cachedSystemPrompt = undefined;
      this.cachedSystemPrompt = fullSystemPrompt;
      this.cachedSystemPromptProtocol = toolProtocol;
      this.lastSentMessageIndex = 0; // Reset for new run

      // ── Agent iteration loop ─────────────────────────────────────────
      let continueLoop = true;
      let malformedToolCallRetries = 0;
      let clarificationToolRetries = 0;
      let planToolRetries = 0;
      let planArtifactSaved = false;
      this.executedToolNames.clear();
      this.successfulFileWrites = 0;

      while (continueLoop && this.state.isRunning) {
        throwIfAborted(this.abortController.signal);
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
        await this.reflectOnProgress();

        // ── We removed the Review Phase to adhere to a single simpler architecture.


        // ── Build context ──────────────────────────────────────────────
        // Always provide tool definitions in the system prompt so the AI knows
        // what tools are available. For models that don't support native tools
        // (supportsTools: false), the API layer will strip them from the payload
        // and the AI will use the JSON-fallback format in the system prompt instead.
        // Ask mode also runs the loop, but receives a read-only tool catalog and
        // executor. The executor enforces the capability boundary; the loop
        // should only decide whether a usable tool surface was supplied.
        const hasTools = this.toolDefinitions.length > 0 && Boolean(this.toolExecutor);
        const context = buildContext(
          this.config,
          updatedMessages,
          this.projectContext,
          hasTools ? this.toolDefinitions : undefined,
          this.cachedSystemPrompt, // Pass cached system prompt to avoid rebuilding
          this.lastSentMessageIndex, // Pass for delta message injection
          toolProtocol,
          this.options?.interactionMode // Pass interaction mode for appropriate system prompt
        );
        // shouldUseTools controls whether we pass native tools in the API payload.
        // We always pass them in context above; this only affects api.ts behavior.
        const shouldUseTools = hasTools && toolProtocol !== 'xml';

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
        const streamIdentity = this.activeRunContext
          ? { runId: this.activeRunContext.runId, conversationId: this.activeRunContext.conversationId, turnId: this.activeRunContext.getSnapshot().turnId }
          : { runId: `legacy:${this.conversationId || 'unknown'}`, conversationId: this.conversationId || 'unknown', turnId: `turn:${this.state.currentIteration}` };
        const streamAssembler = new ProviderStreamAssembler(streamIdentity);
        let responseFinishReason: string | undefined;
        const streamingToolParser = new IncrementalToolCallParser();
        const latestStreamingCalls = new Map<string, StreamingFileToolCall>();
        const originalFileContents = new Map<string, Promise<string>>();
        const resolvedOriginalFileContents = new Map<string, string>();
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
              streamAssembler.accept({ ...streamIdentity, type: 'text-delta', text: chunk });
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

              assistantMsg.content = hideText || isStandaloneToolArgumentsJson(afterThink.trim()) ? '' : afterThink.trim();

              // Feed only the new delta into a retained parser. This creates the
              // UI step once function + path are known and updates it per chunk.
              for (const liveCall of (this.planningRequired && !this.sequentialThoughts.isComplete())
                ? []
                : streamingToolParser.feed(chunk)) {
                latestStreamingCalls.set(liveCall.id, liveCall);
                const emitStreamingCall = (added: number, removed: number) => this.emit({
                  type: 'agent:tool-streaming',
                  data: {
                    messageId: assistantMsg.id,
                    toolCallId: liveCall.id,
                    toolName: liveCall.name,
                    filePath: liveCall.path,
                    content: liveCall.content,
                    added,
                    removed,
                    streamComplete: liveCall.complete,
                  }
                });

                if (liveCall.name === 'editFile') {
                  const root = this.projectContext?.rootPath?.replace(/[\\/]$/, '') || '';
                  const targetPath = /^(?:[a-zA-Z]:[\\/]|\/)/.test(liveCall.path)
                    ? liveCall.path
                    : `${root}/${liveCall.path}`;
                  let originalPromise = originalFileContents.get(targetPath);
                  if (!originalPromise) {
                    originalPromise = Promise.resolve((window as any).electron?.readFileContent(targetPath, root))
                      .then(value => typeof value === 'string' ? value : '')
                      .catch(() => '');
                    originalFileContents.set(targetPath, originalPromise);
                  }
                  const resolvedOriginal = resolvedOriginalFileContents.get(targetPath);
                  if (resolvedOriginal !== undefined) {
                    const stats = calculateLineChanges(resolvedOriginal, liveCall.content);
                    emitStreamingCall(stats.added, stats.removed);
                    continue;
                  }

                  // Show content progress immediately while the one-time original
                  // file read is in flight, then replace it with exact diff stats.
                  emitStreamingCall(toLineCount(liveCall.content), 0);
                  originalPromise.then(original => {
                    resolvedOriginalFileContents.set(targetPath, original);
                    const latest = latestStreamingCalls.get(liveCall.id);
                    if (!latest) return;
                    const stats = calculateLineChanges(original, latest.content);
                    this.emit({
                      type: 'agent:tool-streaming', data: {
                        messageId: assistantMsg.id,
                        toolCallId: latest.id,
                        toolName: latest.name,
                        filePath: latest.path,
                        content: latest.content,
                        added: stats.added,
                        removed: stats.removed,
                        streamComplete: latest.complete,
                      }
                    });
                  });
                } else {
                  emitStreamingCall(toLineCount(liveCall.content), 0);
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
              if (toolProtocol === 'xml') {
                console.warn('[AgentLoop] Rejected native tool call in XML protocol mode:', toolCall.name);
                return;
              }
              streamAssembler.accept({
                ...streamIdentity,
                type: 'tool-complete',
                index: assistantMsg.toolCalls?.length || 0,
                callId: toolCall.id,
                name: toolCall.name,
                argumentsText: JSON.stringify(toolCall.arguments ?? {}),
              });
              const knownToolNames = getKnownToolNames(this.toolDefinitions);
              if (!isPlausibleToolName(toolCall.name, knownToolNames)) {
                console.error('[AgentLoop] BLOCKED invalid tool format from API:', toolCall.name);
                return;
              }

              if (isSequentialThinkingTool(toolCall.name)) {
                toolCall.arguments = normalizeSequentialThinkingArguments(toolCall.arguments);
              }

              // Tag calls before emitting them so the UI can identify the
              // actor even while the call is still waiting or streaming.
              toolCall.agentKind = this.options?.agentRole === 'subagent' ? 'subagent' : 'main';
              toolCall.agentRole = this.options?.agentRole;
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
            onSuccess: (fullText: string, finishReason?: string, tokenUsage?: any) => {
              console.log('[AgentLoop] API onSuccess called, setting isStreaming to false');
              
              if (tokenUsage && tokenUsage.prompt_tokens) {
                const totalLimit = effectiveConfig.maxTokens || 128000;
                const promptTokens = tokenUsage.prompt_tokens;
                this.emit({ 
                  type: 'agent:token-budget', 
                  data: {
                    total: totalLimit,
                    systemPrompt: 0,
                    tools: 0,
                    projectContext: 0,
                    conversationHistory: promptTokens,
                    responseReserved: 0,
                    available: totalLimit - promptTokens,
                    utilizationPercent: Math.min(100, (promptTokens / totalLimit) * 100)
                  }
                });
              }

              this.isStreaming = false;
              responseFinishReason = finishReason;
              fullResponseText = fullText;
              streamAssembler.accept({ ...streamIdentity, type: 'finish', reason: finishReason });

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
              const normalizedTurn = normalizeAssistantTurn(streamAssembler.snapshot(), knownToolNames, toolProtocol);
              const nativeCallIds = new Set((assistantMsg.toolCalls || []).map(call => call.id));
              const parsedCalls = normalizedTurn.actions.flatMap(action =>
                action.kind === 'tool' && !nativeCallIds.has(action.callId)
                  ? [{ name: action.name, arguments: action.arguments, callId: action.callId }]
                  : []
              );
              if (parsedCalls.length > 0) {
                // Assign the parsed calls to assistantMsg
                if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
                for (const pc of parsedCalls) {
                  // Alias bash to runCommand for open source models that hallucinate this
                  if (pc.name === 'bash') {
                    pc.name = 'runCommand';
                  }

                  if (!isPlausibleToolName(pc.name, knownToolNames)) {
                    console.error('[AgentLoop] BLOCKED invalid tool format from text parser:', pc.name);
                    continue;
                  }

                  // Use the stable callId from the parser for reliable deduplication across chunks
                  const id = pc.callId || 'call_' + Math.random().toString(36).substring(2, 9);
                  const newCall: ToolCall = {
                    id,
                    name: pc.name,
                    arguments: pc.arguments,
                    status: 'pending',
                    timestamp: Date.now(),
                    agentKind: this.options?.agentRole === 'subagent' ? 'subagent' : 'main',
                    agentRole: this.options?.agentRole
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
              if (this.options?.interactionMode === 'plan' && /plan_mode_contract|writeImplementationPlan|<tool_call>|Invalid arguments for tool/i.test(assistantMsg.content)) {
                assistantMsg.content = '';
              }
              assistantMsg.isStreaming = false;
              assistantMsg.durationMs = Date.now() - startTime;
              assistantMsg.tokensUsed = estimateTokens(fullText);

              this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
              resolve();
            },
            checkIsStreaming: () => this.isStreaming,
            signal: this.abortController?.signal,
            toolChoice: this.planningRequired && !this.sequentialThoughts.isComplete()
              ? { type: 'function', function: { name: 'mcp__sequential_thinking__sequentialthinking' } }
              : 'auto',
            toolProtocol,
          });
        });

        // ── Native Tool execution isolation ────────
        // No text fallback parsing needed here; api.ts handles native tool calls
        // and returns them directly in assistantMsg.toolCalls.

        let forceRetry = false;
        let hasToolCalls = assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0;

        if (this.options?.interactionMode === 'plan' && hasToolCalls) {
          // In plan mode, enforce separation between inspection and plan creation
          const hasInspectionTools = assistantMsg.toolCalls?.some(tc => 
            tc.name === 'listDirectory' || tc.name === 'readFile'
          );
          const hasPlanCreationTools = assistantMsg.toolCalls?.some(tc => 
            tc.name === 'writeFile' || tc.name === 'editFile'
          );

          // If both inspection and plan creation tools are in the same response,
          // reject the plan creation tools to force separate turns
          if (hasInspectionTools && hasPlanCreationTools) {
            console.log('[Plan Mode] Rejecting plan creation tools in same turn as inspection tools');
            assistantMsg.toolCalls = assistantMsg.toolCalls?.filter(tc => 
              tc.name !== 'writeFile' && tc.name !== 'editFile'
            );
            hasToolCalls = assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0;
            
            // Add a system message to guide the AI
            const separationMsg = createUserMessage(
              '[SYSTEM] In Plan mode, you must inspect the repository first (using listDirectory and readFile), then create the implementation plan in a separate response. Do not call writeFile/editFile in the same turn as inspection tools.'
            );
            separationMsg.isHidden = true;
            updatedMessages.push(separationMsg);
            this.emit({ type: 'agent:message-added', data: separationMsg });
          } else if (hasPlanCreationTools && !planArtifactSaved) {
            // Ensure inspection has happened before allowing plan creation
            const inspectedDirectory = this.executedToolNames.has('listDirectory');
            const inspectedFile = this.executedToolNames.has('readFile');
            
            if (!inspectedDirectory || !inspectedFile) {
              console.log('[Plan Mode] Rejecting plan creation - inspection not completed');
              assistantMsg.toolCalls = assistantMsg.toolCalls?.filter(tc => 
                tc.name !== 'writeFile' && tc.name !== 'editFile'
              );
              hasToolCalls = assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0;
              
              const inspectionMsg = createUserMessage(
                '[SYSTEM] You must complete repository inspection first. Call listDirectory with path "." and readFile for relevant files before creating the implementation plan.'
              );
              inspectionMsg.isHidden = true;
              updatedMessages.push(inspectionMsg);
              this.emit({ type: 'agent:message-added', data: inspectionMsg });
            }
          }

          // Tool syntax, provider scratch text, and echoed policy are internal
          // execution details. Preserve the iteration and its reasoning so Plan
          // renders the same append-only Thought -> Tools sequence as Agent.
          assistantMsg.content = '';
          assistantMsg.isHidden = false;
        }

        if (responseFinishReason === 'length') {
          assistantMsg.isHidden = true;
          assistantMsg.toolCalls = [];
          hasToolCalls = false;
          const correction = createUserMessage(
            '[SYSTEM OUTPUT LIMIT] The previous response was truncated and no action from it was executed. Retry with a much smaller tool call. Use editFile to make targeted modifications rather than resending entire files.'
          );
          correction.isHidden = true;
          updatedMessages.push(correction);
          this.emit({ type: 'agent:message-added', data: correction });
          forceRetry = true;
          this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
        }

        // A model may wrap a copied history record in <tool_call> without a
        // <function=...> element. It is neither a valid tool call nor a useful
        // final response, so hide it and request one corrected response.
        const hasMalformedXmlToolCall = !hasToolCalls && /<tool_call\b[^>]*>/i.test(fullResponseText);
        if (hasMalformedXmlToolCall && malformedToolCallRetries < 1) {
          malformedToolCallRetries++;
          assistantMsg.isHidden = true;
          const correction = createUserMessage(
            '[SYSTEM FORMAT ERROR] The previous <tool_call> block was invalid. Do not wrap action history or tool results in <tool_call>. Retry now using exactly <tool_call><function=TOOL_NAME><parameter=ARGUMENT_NAME>VALUE</parameter></function></tool_call>, or provide a normal final response.'
          );
          correction.isHidden = true;
          updatedMessages.push(correction);
          this.emit({ type: 'agent:message-added', data: correction });
          forceRetry = true;
          this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
        }

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

              const hasStandaloneJsonArguments = !hasToolCalls && isStandaloneToolArgumentsJson(assistantMsg.content || '');
              if (hasStandaloneJsonArguments && malformedToolCallRetries < 2) {
                malformedToolCallRetries++;
                assistantMsg.content = '';
                assistantMsg.isHidden = true;
                const correction = createUserMessage(
                  '[SYSTEM FORMAT ERROR] You emitted tool arguments as standalone JSON, so no tool was called. Retry the intended action using the required XML tool-call protocol. Do not print JSON or explain the format.'
                );
                correction.isHidden = true;
                updatedMessages.push(correction);
                this.emit({ type: 'agent:message-added', data: correction });
                this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
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

        // ── Process tool calls ─────────────────────────────────────────
        if (
          assistantMsg.toolCalls &&
          assistantMsg.toolCalls.length > 0 &&
          this.toolExecutor &&
          this.state.isRunning
        ) {
          const executeToolInternal = async (toolCall: any) => {
            if (!this.state.isRunning) return;

            if (this.isBlockedByPlanningGate(toolCall)) {
              const result: ToolResult = {
                success: false,
                output: 'Structured planning is incomplete. Continue the Sequential Thinking trace until nextThoughtNeeded is false before planning, delegating, writing files, or executing commands.',
              };
              toolCall.result = result;
              toolCall.status = 'error';
              const toolMsg = createToolMessage(toolCall.id, toolCall.name, result);
              updatedMessages.push(toolMsg);
              this.emit({ type: 'agent:tool-result', data: { toolCall, result } });
              this.emit({ type: 'agent:message-added', data: toolMsg });
              return;
            }

            toolCall.status = 'running';
            this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });

            this.state.status = `Executing ${toolCall.name}...`;
            this.state.currentToolCall = toolCall;
            this.emit({ type: 'agent:tool-executing', data: toolCall });

            try {
              // SECURITY INTERCEPTOR: Check if tool needs manual UI approval
              let isApproved = true;
              if (SecurityInterceptor.requiresApproval(toolCall, this.options.toolDefinitions, this.options.projectId)) {
                toolCall.status = 'pending';
                this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
                this.state.status = `Awaiting your approval for ${toolCall.name}...`;
                this.emit({ type: 'agent:tool-approval-needed', data: toolCall });

                // Suspend execution and wait for UI event
                isApproved = await new Promise<boolean>((resolve) => {
                  if (this.abortController?.signal.aborted) {
                    resolve(false);
                    return;
                  }
                  const cleanup = () => {
                    window.removeEventListener('tool-approval-response', handler);
                    this.abortController?.signal.removeEventListener('abort', onAbort);
                  };
                  const handler = (e: any) => {
                    if (e.detail.toolCallId === toolCall.id) {
                      cleanup();
                      resolve(e.detail.approved);
                    }
                  };
                  const onAbort = () => { cleanup(); resolve(false); };
                  window.addEventListener('tool-approval-response', handler);
                  this.abortController?.signal.addEventListener('abort', onAbort, { once: true });
                });

                if (isApproved) {
                  toolCall.status = 'running';
                  this.emit({ type: 'agent:message-updated', data: { ...assistantMsg } });
                }
              }

              let result: ToolResult;
              if (isApproved) {
                // Check if this is a coding operation
                const isCodingOperation = isFileTool(toolCall.name);
                const filePath = toolCall.arguments?.path || toolCall.arguments?.TargetFile || '';

                toolCall.agentKind = this.options?.agentRole === 'subagent' ? 'subagent' : 'main';
                toolCall.agentRole = this.options?.agentRole;

                if (isCodingOperation && filePath) {
                  this.emit({
                    type: 'agent:coding-started',
                    data: {
                      callId: toolCall.id,
                      fileName: filePath.split('/').pop() || filePath,
                      filePath,
                      toolName: toolCall.name
                    }
                  });
                }

                this.state.status = `Executing ${toolCall.name}...`;
                if (this.options?.interactionMode === 'plan' && (toolCall.name === 'writeFile' || toolCall.name === 'editFile')) {
                  const inspectedDirectory = this.executedToolNames.has('listDirectory');
                  const inspectedFile = this.executedToolNames.has('readFile');
                  if (!inspectedDirectory || !inspectedFile) {
                    result = {
                      success: false,
                      output: 'Plan mode requires successful listDirectory and readFile calls before writing the implementation plan.',
                    };
                  } else if (toolCall.name === 'writeFile' && planArtifactSaved) {
                    result = {
                      success: false,
                      output: 'The canonical implementation plan already exists. Read it and use editFile with an exact anchor for revisions.',
                    };
                  } else if (toolCall.name === 'editFile' && !planArtifactSaved) {
                    result = {
                      success: false,
                      output: 'Create the canonical implementation plan with writeFile before revising it with editFile.',
                    };
                  } else {
                    result = await this.toolExecutor(toolCall, this.abortController.signal, { userMessageId: this.userMessageId, conversationId: this.conversationId, projectRoot: this.projectContext?.rootPath, interactionMode: 'plan' });
                  }
                } else {
                  result = await this.toolExecutor(toolCall, this.abortController.signal, { userMessageId: this.userMessageId, conversationId: this.conversationId, projectRoot: this.projectContext?.rootPath, interactionMode: this.options?.interactionMode });
                }
                // Attach the result before deriving the user-facing operation so
                // writeFile can distinguish a new file from an existing file.
                toolCall.result = result;

                if (result.success) {
                  this.executedToolNames.add(toolCall.name);
                  if (this.options?.interactionMode === 'plan' && toolCall.name === 'writeFile') {
                    planArtifactSaved = true;
                  }

                  // Emit coding progress for successful file operations
                  if (isCodingOperation && filePath) {
                    const contentStr = typeof toolCall.arguments?.content === 'string' ? toolCall.arguments.content : '';
                    const addedLines = contentStr ? contentStr.split('\n').length : 0;
                    this.emit({
                      type: 'agent:coding-progress',
                      data: {
                        callId: toolCall.id,
                        fileName: filePath.split('/').pop() || filePath,
                        filePath,
                        added: addedLines,
                        removed: 0,
                        toolName: toolCall.name,
                        operation: getFileOperation(toolCall)
                      }
                    });

                    this.emit({
                      type: 'agent:coding-complete',
                      data: {
                        callId: toolCall.id,
                        fileName: filePath.split('/').pop() || filePath,
                        filePath,
                        toolName: toolCall.name,
                        operation: getFileOperation(toolCall)
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

              const thoughtSummary = this.sequentialThoughts.record(toolCall, result);
              if (thoughtSummary) {
                this.emit({
                  type: 'agent:progress-update',
                  data: {
                    phase: 'planning',
                    thoughtNumber: thoughtSummary.thoughtNumber,
                    totalThoughts: thoughtSummary.totalThoughts,
                    nextThoughtNeeded: thoughtSummary.nextThoughtNeeded,
                    isRevision: thoughtSummary.isRevision,
                    branchId: thoughtSummary.branchId,
                  },
                });
                if (this.sequentialThoughts.isComplete()) {
                  this.state.phase = 'executing';
                  this.state.status = 'Structured plan complete. Executing tasks...';
                  this.emit({ type: 'agent:planning-complete', data: { structured: true, ...thoughtSummary } });
                } else {
                  this.state.phase = 'planning';
                  this.state.status = `Planning step ${thoughtSummary.thoughtNumber} of ${thoughtSummary.totalThoughts}...`;
                }
              }

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

          const scheduler = this.actionScheduler || new ActionScheduler({ signal: this.abortController?.signal });
          await scheduler.executeInOrder(assistantMsg.toolCalls, async toolCall => {
            await executeToolInternal(toolCall);
            return toolCall.result || { success: false, output: 'Tool execution did not produce an observation.' };
          });

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
            // Child outcomes are awaited by the scheduler wave. Continue so the
            // parent model can synthesize them instead of entering legacy sleep.
            continueLoop = true;
          }
        } else {
          // No tool calls — LLM gave a pure text-only response.
          if (forceRetry) {
            continueLoop = true;
          } else if (this.options?.interactionMode === 'plan' && planArtifactSaved) {
            continueLoop = false;
          } else if (this.options?.interactionMode === 'plan' && planToolRetries < 2) {
            planToolRetries++;
            const nudgeMsg = createUserMessage(
              `[SYSTEM] Plan mode requires real repository inspection and a saved artifact. You did not call any tools. Call listDirectory with path ".", read the relevant files with readFile, then call writeFile with path "implementation_plan.md" and the complete plan. Do not answer with plan text alone. (Retry ${planToolRetries}/2)`
            );
            nudgeMsg.isHidden = true;
            updatedMessages.push(nudgeMsg);
            this.emit({ type: 'agent:message-added', data: nudgeMsg });
            continueLoop = true;
          } else if (this.options?.interactionMode === 'plan' && this.toolExecutor && this.executedToolNames.has('listDirectory') && this.executedToolNames.has('readFile')) {
            // Do not allow Plan mode to finish with an unsaved chat-only plan.
            // If the provider still ignored the tool contract after the retry,
            // route its generated plan through the same canonical artifact tool.
            const planCall: ToolCall = {
              id: `plan_${Math.random().toString(36).slice(2, 9)}`,
              name: 'writeFile',
              arguments: { path: 'implementation_plan.md', content: fullResponseText.trim(), artifactMetadata: { requestFeedback: true, userFacing: true, summary: 'Conversation-scoped implementation plan for review before coding.' } },
              status: 'running',
              timestamp: Date.now(),
              agentKind: 'main',
              agentRole: this.options?.agentRole,
            };
            assistantMsg.toolCalls = [planCall];
            this.emit({ type: 'agent:tool-call', data: planCall });
            this.emit({ type: 'agent:tool-executing', data: planCall });
            const planResult = await this.toolExecutor(planCall, this.abortController.signal, { userMessageId: this.userMessageId, interactionMode: 'plan' });
            planCall.result = planResult;
            planCall.status = planResult.success ? 'completed' : 'error';
            planCall.durationMs = Date.now() - planCall.timestamp;
            assistantMsg.isHidden = false;
            assistantMsg.content = '';
            const planToolMessage = createToolMessage(planCall.id, planCall.name, planResult);
            updatedMessages.push(planToolMessage);
            this.emit({ type: 'agent:tool-result', data: { toolCall: planCall, result: planResult } });
            this.emit({ type: 'agent:message-added', data: planToolMessage });
            continueLoop = false;
          } else {
              // Check if there are still pending semantic tasks in THIS conversation.
              const convId = this.state.conversationId;

              // Find tasks that are ready to execute (dependencies satisfied, not delegated, not completed)
              // Rebuild graph from fresh task store data so status is current,
              // then use TaskGraph.getExecutableTasks() for proper dependency-aware scheduling.
              const freshTasks = convId ? getDurableTasksForConversation(convId) : [];
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
                  `[SYSTEM] You output text but did NOT call any tools or invoke sub-agents. There are ${readyTasks.length} tasks ready for execution:\n${taskList}\n\nYou MUST use your tools to actually complete these tasks. Execute directly owned tasks with tools and status updates. Delegate selected ready tasks with invokeSubagent using the taskId. A delegated implementation task owns its target file, so never pre-create that child-owned file.\n\nDo not describe what you will do — actually call the tools NOW.`
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
          const completion = await this.validateGoalSatisfaction(updatedMessages);
          this.state.goalSatisfied = completion.satisfied;
          this.emit({
            type: completion.satisfied ? 'agent:goal-satisfied' : 'agent:goal-not-satisfied',
            data: completion,
          });
          if (completion.satisfied) {
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
      const identity = this.activeRunContext
        ? this.activeRunContext.getSnapshot()
        : undefined;
      const enrichedEvent: AgentEvent = identity
        ? { ...event, runId: identity.runId, conversationId: identity.conversationId, turnId: identity.turnId }
        : event;
      this.eventCallback(enrichedEvent);
      // Preserve the legacy payload shape while adding run identity for scoped listeners.
      window.dispatchEvent(new CustomEvent(enrichedEvent.type, {
        detail: { ...(enrichedEvent.data || {}), runId: enrichedEvent.runId, conversationId: this.options?.activityConversationId || enrichedEvent.conversationId, turnId: enrichedEvent.turnId },
      }));
    } catch (e) {
      console.error('[AgentLoop] Event callback error:', e);
    }
  }

  /** Detect ambiguities in user request that need clarification */
  private async detectAmbiguities(userMessage: AgenticMessage): Promise<string | null> {
    // If the message contains attachments (like an image or file), the context is likely
    // in the attachment, so skip ambiguity detection.
    if (userMessage.attachments && userMessage.attachments.length > 0) {
      return null;
    }

    const textContent = userMessage.content || '';

    // Simple heuristic-based ambiguity detection
    // Removed overly broad patterns that matched normal coding requests
    const ambiguityPatterns = [
      { pattern: /\b(it|this|that)\b/gi, message: 'What specifically are you referring to?' },
      { pattern: /\b(fix|repair|debug)\b/gi, message: 'What specific issue or error are you encountering?' },
      { pattern: /\b(improve|optimize|enhance)\b/gi, message: 'What specific metrics or aspects should be improved?' },
    ];

    // Only trigger for very short, vague messages (less than 5 words)
    if (textContent.split(' ').length >= 5) {
      return null;
    }

    for (const { pattern, message } of ambiguityPatterns) {
      if (pattern.test(textContent)) {
        return message;
      }
    }

    return null;
  }

  /** Plan execution by creating a task graph from the goal */
  private async planExecution(): Promise<TaskGraph> {
    // Use existing tasks from taskStore if they exist (created by createTodoListTasks)
    const convId = this.state.conversationId;
    const existingTasks = convId ? getDurableTasksForConversation(convId) : [];

    if (existingTasks.length > 0) {
      // Use the tasks already created by the LLM via createTodoListTasks
      // Convert taskStore tasks to TaskGraph format
      return new TaskGraph(existingTasks);
    }

    return new TaskGraph([]);
  }

  /** Reflection phase - evaluate progress and strategy */
  private async reflectOnProgress(): Promise<void> {
    if (this.planningRequired && !this.sequentialThoughts.isComplete()) {
      this.state.phase = 'planning';
      this.state.status = 'Completing structured plan...';
      return;
    }

    this.state.phase = 'reflecting';
    this.state.status = 'Reflecting on progress...';
    this.emit({ type: 'agent:reflection-started' });

    const tasks = this.state.conversationId ? getDurableTasksForConversation(this.state.conversationId) : [];
    const taskGraph = new TaskGraph(tasks);
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
      this.emit({
        type: 'agent:error', data: {
          message: 'Agent appears stuck. Considering alternative approach...'
        }
      });
    }

    // Update progress
    this.emit({
      type: 'agent:progress-update', data: {
        progress: this.state.progress,
        completedTasks: stats.completedTasks,
        totalTasks: stats.totalTasks,
      }
    });

    this.emit({ type: 'agent:reflection-complete' });
  }

  private isBlockedByPlanningGate(toolCall: ToolCall): boolean {
    if (!this.planningRequired || this.sequentialThoughts.isComplete()) return false;
    return isToolBlockedBeforeStructuredPlan(toolCall.name);
  }

  /** Validate if goal has been satisfied */
  private async validateGoalSatisfaction(messages: AgenticMessage[]): Promise<{
    satisfied: boolean;
    reason: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    executionEvidence: boolean;
    structuredPlanningComplete: boolean;
  }> {
    // Check if all tasks in taskStore for this conversation are completed
    const convId = this.state.conversationId;
    const structuredPlanningComplete = !this.planningRequired || this.sequentialThoughts.isComplete();
    if (!convId) {
      return {
        satisfied: false,
        reason: 'No conversation is associated with this run.',
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        executionEvidence: this.executedToolNames.size > 0,
        structuredPlanningComplete,
      };
    }

    const durableTasks = getDurableTasksForConversation(convId);
    const failedTasks = durableTasks.filter(task => task.status === 'failed');
    const completedTasks = durableTasks.filter(task => task.status === 'completed');
    const executionEvidence = this.executedToolNames.size > 0 || this.successfulFileWrites > 0;
    const allTasksComplete = durableTasks.length > 0 && completedTasks.length === durableTasks.length;
    const satisfied = allTasksComplete && failedTasks.length === 0 && structuredPlanningComplete && executionEvidence;

    let reason = 'Goal evidence is complete.';
    if (!durableTasks.length) reason = 'No durable goal tasks were created.';
    else if (failedTasks.length) reason = `${failedTasks.length} durable task(s) failed.`;
    else if (!allTasksComplete) reason = `${durableTasks.length - completedTasks.length} durable task(s) remain incomplete.`;
    else if (!structuredPlanningComplete) reason = 'Structured planning is incomplete.';
    else if (!executionEvidence) reason = 'No successful tool execution evidence was recorded.';

    return {
      satisfied,
      reason,
      totalTasks: durableTasks.length,
      completedTasks: completedTasks.length,
      failedTasks: failedTasks.length,
      executionEvidence,
      structuredPlanningComplete,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  projectId?: string;
  projectContext?: ProjectContext;
  /** The loop owns cancellation; executors must receive the same signal. */
  toolExecutor?: (toolCall: ToolCall, signal: AbortSignal, context?: { userMessageId?: string; conversationId?: string; projectRoot?: string; interactionMode?: 'ask' | 'plan' | 'agent' }) => Promise<ToolResult>;
  toolDefinitions?: any[];
  conversationId?: string;
  /** Parent conversation used to scope global Activity for child loops. */
  activityConversationId?: string;
  userMessageId?: string;
  agentRole?: 'orchestrator' | 'subagent';
  billingSession?: TokenBillingSession;
  runId?: string;
  turnId?: string;
  interactionMode?: 'ask' | 'plan' | 'agent';
  executionPlanPath?: string;
  executionPlanInstruction?: string;
  toolProtocol?: 'native' | 'xml';
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
    projectId: options?.projectId,
    projectContext: options?.projectContext,
    toolExecutor: options?.toolExecutor,
    toolDefinitions: options?.toolDefinitions,
    conversationId: options?.conversationId,
    userMessageId: options?.userMessageId,
    agentRole: options?.agentRole,
    billingSession: options?.billingSession,
    runId: options?.runId,
    turnId: options?.turnId,
    interactionMode: options?.interactionMode,
    executionPlanPath: options?.executionPlanPath,
    executionPlanInstruction: options?.executionPlanInstruction,
    toolProtocol: options?.toolProtocol,
  });
}

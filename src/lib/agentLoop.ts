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
import { buildContext, ProjectContext } from './contextBuilder';
import {
  needsSummarization,
  buildSummaryRequest,
  applySummarization,
  splitForSummarization,
} from './contextSummarizer';
import { estimateTokens } from './tokenCounter';
import type { TokenBudget } from './tokenCounter';
import { callDispatcherAPI } from '../api';
import { SecurityInterceptor } from './SecurityInterceptor';
import { createTask, updateTask } from './taskStore';
import { TaskGraph } from './taskGraph';

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
  | 'agent:coding-started'
  | 'agent:coding-progress'
  | 'agent:coding-complete';

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
  phase: 'understanding' | 'planning' | 'executing' | 'reflecting' | 'validating' | 'done';
  goal?: string;
  goalSatisfied: boolean;
  progress: number; // 0-100
  estimatedRemainingMs?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  stuckCount: number;
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
 * Supports two formats:
 * 1. XML-style: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * 2. JSON blocks: ```json\n{"tool_call": {"name": "...", "arguments": {...}}}\n```
 */
function parseToolCallsFromText(text: string, knownToolNames?: Set<string>): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // ── Format 0: Antigravity native syntax: call:tool_name{json_args} ────────────────
  let startIndex = text.indexOf('call:');
  while (startIndex !== -1) {
    const braceIndex = text.indexOf('{', startIndex);
    if (braceIndex !== -1 && braceIndex < startIndex + 50) {
      const toolName = text.substring(startIndex + 5, braceIndex).trim();
      
      if (!isPlausibleToolName(toolName, knownToolNames)) {
        console.warn('[AgentLoop] Invalid tool name in text parsing, skipping:', toolName);
        startIndex = text.indexOf('call:', startIndex + 5);
        continue;
      }
      
      let braceCount = 0;
      let endIndex = -1;
      
      for (let i = braceIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }
      
      if (endIndex !== -1) {
        try {
          const argsStr = text.substring(braceIndex, endIndex + 1);
          const parsedArgs = argsStr === '{}' ? {} : JSON.parse(argsStr);
          toolCalls.push({
            name: toolName,
            arguments: parsedArgs
          });
          startIndex = text.indexOf('call:', endIndex + 1);
          continue;
        } catch (e) {
          console.warn('[AgentLoop] Failed to parse Antigravity tool call arguments:', e);
        }
      }
    }
    startIndex = text.indexOf('call:', startIndex + 5);
  }

  if (toolCalls.length > 0) {
    return toolCalls;
  }

  // ── Format 1: XML-style tool calls ────────────────────────────────────
  const xmlRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
  let match: RegExpExecArray | null;

  while ((match = xmlRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name) {
        if (isPlausibleToolName(parsed.name, knownToolNames)) {
          toolCalls.push({
            name: parsed.name,
            arguments: parsed.arguments || parsed.params || parsed.args || {},
          });
        } else {
          console.warn('[AgentLoop] Invalid tool name in XML format, skipping:', parsed.name);
        }
      }
    } catch (e) {
      console.warn('[AgentLoop] Failed to parse XML tool call:', e);
    }
  }

  // ── Format 2: JSON code blocks or raw JSON with tool_call ────────────────
  if (toolCalls.length === 0) {
    let startIndex = text.indexOf('{');
    while (startIndex !== -1) {
      let braceCount = 0;
      let endIndex = -1;
      for (let i = startIndex; i < text.length; i++) {
        if (text[i] === '{') braceCount++;
        else if (text[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
      }
      if (endIndex !== -1) {
        try {
          const str = text.substring(startIndex, endIndex + 1);
          const parsed = JSON.parse(str);
          if (parsed.tool_call || (parsed.name && Object.keys(parsed).includes('arguments'))) {
            const tc = parsed.tool_call || parsed;
            if (tc.name) {
              if (isPlausibleToolName(tc.name, knownToolNames)) {
                toolCalls.push({
                  name: tc.name,
                  arguments: tc.arguments || tc.params || tc.args || {},
                });
              } else {
                console.warn('[AgentLoop] Invalid tool name in JSON format, skipping:', tc.name);
              }
              startIndex = text.indexOf('{', endIndex + 1);
              continue;
            }
          } else if (Object.keys(parsed).length === 1) {
            // Support raw format: {"readFile": {"path": "..."}}
            const possibleName = Object.keys(parsed)[0];
            const possibleArgs = parsed[possibleName];
            if (typeof possibleArgs === 'object' && possibleArgs !== null && !Array.isArray(possibleArgs)) {
              if (isPlausibleToolName(possibleName, knownToolNames)) {
                toolCalls.push({
                  name: possibleName,
                  arguments: possibleArgs,
                });
              } else {
                console.warn('[AgentLoop] Invalid tool name in raw JSON format, skipping:', possibleName);
              }
              startIndex = text.indexOf('{', endIndex + 1);
              continue;
            }
          }
        } catch (e) {
          // ignore parsing errors and continue searching
        }
      }
      startIndex = text.indexOf('{', startIndex + 1);
    }
  }

  // ── Format 3: Direct function-call style ──────────────────────────────
  if (toolCalls.length === 0) {
    const funcRegex = /\[TOOL:\s*(\w+)\]\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/gi;
    while ((match = funcRegex.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2].trim());
        const name = match[1];
        if (isPlausibleToolName(name, knownToolNames)) {
          toolCalls.push({ name, arguments: args });
        }
      } catch (e) {
        console.warn('[AgentLoop] Failed to parse function-call style tool call:', e);
      }
    }
  }

  // ── Format 4: Custom XML syntax (e.g. <tool_call>name<arg_key>...</arg_value></tool_call>) ──
  if (toolCalls.length === 0) {
    const customXmlRegex = /<tool_call>\s*([a-zA-Z0-9_-]+)\s*([\s\S]*?)<\/tool_call>/gi;
    while ((match = customXmlRegex.exec(text)) !== null) {
      const name = match[1].trim();
      const argsStr = match[2];
      const args: Record<string, any> = {};
      
      const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gi;
      let argMatch;
      while ((argMatch = argRegex.exec(argsStr)) !== null) {
        let val = argMatch[2].trim();
        if (val === 'true') val = true as any;
        else if (val === 'false') val = false as any;
        else if (!isNaN(Number(val))) val = Number(val) as any;
        args[argMatch[1].trim()] = val;
      }
      
      if (isPlausibleToolName(name, knownToolNames)) {
        toolCalls.push({ name, arguments: args });
      }
    }
  }

  // ── Format 6: Native <function=name> format ──────────────────────────────
  if (toolCalls.length === 0) {
    const fnRegex = /<function=([a-zA-Z0-9_-]+)>\s*([\s\S]*?)<\/function>/gi;
    while ((match = fnRegex.exec(text)) !== null) {
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
      
      if (isPlausibleToolName(name, knownToolNames)) {
        toolCalls.push({ name, arguments: args });
      }
    }
  }

  // ── Format 5: Self-closing XML tool calls ────────────────────────────────
  // e.g. <listDirectory path="app/agentic" /> or <readFile path="./src" depth="2" />
  // This is a format some LLMs produce when they learn from XML-style history.
  if (toolCalls.length === 0) {
    // Match any self-closing tag whose name looks like a camelCase tool name
    const selfClosingRegex = /<([a-zA-Z][a-zA-Z0-9_]+)\s+([^>]*?)\s*\/>/gi;
    while ((match = selfClosingRegex.exec(text)) !== null) {
      const name = match[1];
      const attrsStr = match[2];
      const args: Record<string, any> = {};
      // Parse key="value" attributes
      const attrRegex = /(\w+)="([^"]*)"/gi;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        let val: any = attrMatch[2];
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
        args[attrMatch[1]] = val;
      }
      if (isPlausibleToolName(name, knownToolNames)) {
        toolCalls.push({ name, arguments: args });
        break; // Only take the first one per response
      }
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
  cleaned = cleaned.replace(/^TOOL ACTION: \w+\(.*$/gim, '');
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

  constructor(
    config: AIConfig,
    eventCallback: AgentEventCallback,
    options?: {
      projectContext?: ProjectContext;
      toolExecutor?: (toolCall: ToolCall) => Promise<ToolResult>;
      toolDefinitions?: any[];
    }
  ) {
    this.config = config;
    this.eventCallback = eventCallback;
    this.projectContext = options?.projectContext;
    this.toolExecutor = options?.toolExecutor || null;
    this.toolDefinitions = options?.toolDefinitions || [];

    this.state = {
      isRunning: false,
      currentIteration: 0,
      maxIterations: config.maxAgentIterations,
      status: 'idle',
      phase: 'understanding',
      goalSatisfied: false,
      progress: 0,
      stuckCount: 0,
    };
  }

  /** Get current agent state */
  getState(): AgentState {
    return { ...this.state };
  }

  /** Stop the agent loop */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
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

        // ── Review Phase (High Architecture Only) ──────────────────────
        const latestMsg = updatedMessages[updatedMessages.length - 1];
        if (this.config.architecture === 'high' && latestMsg && latestMsg.role === 'tool') {
          this.state.status = 'Reviewing tool execution...';
          this.emit({ type: 'agent:thinking' });

          const reviewContext = buildContext(
            this.config,
            updatedMessages,
            this.projectContext,
            undefined // No tools for reviewer
          );
          
          reviewContext.messages.push({
            role: 'user',
            content: '[SYSTEM - REVIEW PHASE]: You are the Reviewer AI. Review the results of the recent tool executions. Output a brief text summary of whether the tool succeeded, what data was found, and what the logical next step should be. Do NOT output any JSON tool calls. You MUST conclude your review by printing exactly "[CONTINUE]" if the main AI needs to take further action, or "[DONE]" if the user\'s request is fully satisfied.'
          });

          const reviewMsg = createAssistantMessage(this.config.model);
          reviewMsg.agentIteration = this.state.currentIteration;
          reviewMsg.isHidden = true; // Completely hide this from the user's chat!
          updatedMessages.push(reviewMsg);
          this.emit({ type: 'agent:message-added', data: reviewMsg });

          let reviewText = '';
          await new Promise<void>((resolve) => {
            if (!this.state.isRunning) return resolve();
            
            callDispatcherAPI({
              config: this.config,
              messages: reviewContext.messages.map(m => ({
                ...m,
                role: (m.role === 'tool' ? 'user' : m.role) as 'user' | 'assistant' | 'system',
              })),
              tools: undefined,
              onChunk: (chunk: string) => {
                reviewText += chunk;
                reviewMsg.isStreaming = true;
                reviewMsg.content = reviewText;
                
                this.emit({ 
                  type: 'agent:streaming', 
                  data: { 
                    text: chunk, 
                    fullText: reviewText,
                    parsedContent: reviewText,
                    thinkingContent: ''
                  } 
                });
              },
              onError: () => resolve(),
              onSuccess: () => {
                reviewMsg.isStreaming = false;
                reviewMsg.content = reviewText.trim();
                this.emit({ type: 'agent:message-updated', data: { ...reviewMsg } });
                resolve();
              },
              checkIsStreaming: () => this.state.isRunning,
              signal: this.abortController?.signal,
            });
          });

          // Wait before starting the decision phase
          if (this.state.isRunning) {
            this.state.status = 'Waiting 2s (API rate limit)...';
            this.emit({ type: 'agent:thinking' });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

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
          hasTools ? this.toolDefinitions : undefined
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

        // ── Call LLM ─────────────────────────────────────────────────────
        let fullResponseText = '';

        await new Promise<void>((resolve, reject) => {
          if (!this.state.isRunning) {
            resolve();
            return;
          }

          const startTime = Date.now();

          callDispatcherAPI({
            config: this.config,
            // Cast to api ChatMessage type: filter out 'tool' role messages since the API
            // only accepts 'user' | 'assistant' | 'system'. Tool results were already
            // converted to 'user' messages in contextBuilder.ts.
            messages: context.messages.map(m => ({
              ...m,
              role: (m.role === 'tool' ? 'user' : m.role) as 'user' | 'assistant' | 'system',
            })),
            // Always pass tool definitions; api.ts will filter based on model's supportsTools flag
            tools: shouldUseTools ? this.toolDefinitions : undefined,
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
                const toolMatch = afterThink.match(/```(?:json)?|<function=|\[TOOL:|\{/i);
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
              
              // Log for debugging HTML content in chunks
              if (chunk.includes('<') && chunk.includes('>')) {
                console.log('[AgentLoop] Chunk contains HTML-like content:', chunk.substring(0, 100));
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
              this.emit({ type: 'agent:error', data: { message: error.message } });
              reject(error);
            },
            onSuccess: (fullText: string) => {
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
                  const toolMatch = afterThink.match(/```(?:json)?|<function=|\[TOOL:|\{/i);
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
            checkIsStreaming: () => this.state.isRunning,
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
          const currentSignature = JSON.stringify(assistantMsg.toolCalls!.map(tc => ({ name: tc.name, args: tc.arguments })));
          
          if (currentSignature === this.state.lastToolSignature) {
            this.state.consecutiveDuplicates = (this.state.consecutiveDuplicates || 0) + 1;
            
            if (this.state.consecutiveDuplicates >= 1) {
              console.warn('[AgentLoop] Detected duplicate tool call loop. Intercepting.');
              
              assistantMsg.isHidden = true; // Hide the repeating tool call
              
              const errorMsg = createUserMessage(
                `[SYSTEM ERROR] You just repeated the exact same tool call. Do not repeat identical tool calls. You are stuck in a loop. Re-evaluate your strategy and try a DIFFERENT approach or tool.`
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
          // Separate read-only tools (can run in parallel) from write tools (must run sequentially)
          const readOnlyTools = assistantMsg.toolCalls.filter(tc => 
            ['listDirectory', 'readFile', 'grepSearch', 'findByName'].includes(tc.name)
          );
          const writeTools = assistantMsg.toolCalls.filter(tc => 
            !['listDirectory', 'readFile', 'grepSearch', 'findByName'].includes(tc.name)
          );

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
                    const contentLength = toolCall.arguments?.content?.length || 0;
                    this.emit({ 
                      type: 'agent:coding-progress', 
                      data: { 
                        fileName: filePath.split('/').pop() || filePath,
                        filePath,
                        added: contentLength,
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
          
          // Run write tools sequentially to avoid race conditions
          for (const writeTool of writeTools) {
            await executeToolInternal(writeTool);
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
            // Continue loop to let LLM process tool results
            continueLoop = true;
          }
        } else {
          // No tool calls — LLM gave a pure text-only response.
          // Only stop if the agent has actually executed tools and done meaningful work
          const hasExecutedTools = this.executedToolNames.size > 0;
          const hasWrittenFiles = this.successfulFileWrites > 0;
          
          if (forceRetry) {
            continueLoop = true;
          } else if (!hasExecutedTools) {
            // Haven't executed any tools yet - force continue
            continueLoop = true;
            console.log('[AgentLoop] Text-only response but no tools executed yet, continuing...');
          } else if (!hasWrittenFiles && this.state.currentIteration < 3) {
            // Early iteration without file writes - continue
            continueLoop = true;
            console.log('[AgentLoop] Early iteration without file writes, continuing...');
          } else {
            // Allow stopping after tools have been executed
            continueLoop = false;
            console.log('[AgentLoop] Text-only response with tools executed, stopping...');
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
    const ambiguityPatterns = [
      { pattern: /it|this|that/gi, message: 'What specifically are you referring to?' },
      { pattern: /fix|repair|debug/gi, message: 'What specific issue or error are you encountering?' },
      { pattern: /improve|optimize|enhance/gi, message: 'What specific metrics or aspects should be improved?' },
      { pattern: /add|implement|create/gi, message: 'Could you provide more details about the expected behavior?' },
    ];

    for (const { pattern, message } of ambiguityPatterns) {
      if (pattern.test(userMessage) && userMessage.split(' ').length < 10) {
        return message;
      }
    }

    return null;
  }

  /** Plan execution by creating a task graph from the goal */
  private async planExecution(messages: AgenticMessage[]): Promise<TaskGraph> {
    // In a sophisticated implementation, this would:
    // 1. Call LLM to decompose the goal into subtasks
    // 2. Identify dependencies between tasks
    // 3. Estimate resources and time for each task
    // 4. Create tasks in the task store
    
    // For now, create a placeholder task graph
    const planningMsg = createAssistantMessage(this.config.model);
    planningMsg.isHidden = true;
    planningMsg.content = '[PLANNING PHASE]: Analyzing requirements and creating execution plan...';
    messages.push(planningMsg);
    this.emit({ type: 'agent:message-added', data: planningMsg });

    // Create initial planning task
    const planTask = createTask({
      title: 'Plan execution approach',
      description: 'Analyze requirements and create execution plan',
      priority: 'high',
      tags: ['planning'],
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
    this.state.progress = Math.round(progress);

    // Check if stuck (no progress for multiple iterations)
    if (progress === this.state.progress && this.state.currentIteration > 3) {
      this.state.stuckCount++;
    } else {
      this.state.stuckCount = 0;
    }

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
    this.state.phase = 'validating';
    this.state.status = 'Validating goal satisfaction...';

    // In a sophisticated implementation, this would:
    // 1. Check if all tasks are completed
    // 2. Run validation tests if applicable
    // 3. Verify the solution meets the original requirements
    // 4. Check for unintended side effects

    // For now, disable automatic goal satisfaction detection
    // Let the agent run until it naturally stops (no tool calls) or hits max iterations
    // This prevents premature stopping when the agent says it will do something but hasn't yet
    this.emit({ type: 'agent:goal-not-satisfied' });
    return false;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/** Create a new AgentLoop with current configuration */
export function createAgentLoop(
  eventCallback: AgentEventCallback,
  options?: {
    projectId?: string;
    projectContext?: ProjectContext;
    toolExecutor?: (toolCall: ToolCall) => Promise<ToolResult>;
    toolDefinitions?: any[];
  }
): AgentLoop {
  const config = getAIConfig(options?.projectId);
  return new AgentLoop(config, eventCallback, {
    projectContext: options?.projectContext,
    toolExecutor: options?.toolExecutor,
    toolDefinitions: options?.toolDefinitions,
  });
}

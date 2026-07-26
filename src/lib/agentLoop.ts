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
  | 'agent:message-updated'; // fired when toolCalls/content change on an existing message

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
}

// ── Tool Call Parsing ──────────────────────────────────────────────────────

interface ParsedToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Parse tool calls from LLM response text.
 * Supports two formats:
 * 1. XML-style: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 * 2. JSON blocks: ```json\n{"tool_call": {"name": "...", "arguments": {...}}}\n```
 */
function parseToolCallsFromText(text: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // ── Format 0: Antigravity native syntax: call:tool_name{json_args} ────────────────
  let startIndex = text.indexOf('call:');
  while (startIndex !== -1) {
    const braceIndex = text.indexOf('{', startIndex);
    if (braceIndex !== -1 && braceIndex < startIndex + 50) {
      const toolName = text.substring(startIndex + 5, braceIndex).trim();
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
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || parsed.params || parsed.args || {},
        });
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
              toolCalls.push({
                name: tc.name,
                arguments: tc.arguments || tc.params || tc.args || {},
              });
              startIndex = text.indexOf('{', endIndex + 1);
              continue;
            }
          } else if (Object.keys(parsed).length === 1) {
            // Support raw format: {"readFile": {"path": "..."}}
            const possibleName = Object.keys(parsed)[0];
            const possibleArgs = parsed[possibleName];
            if (typeof possibleArgs === 'object' && possibleArgs !== null && !Array.isArray(possibleArgs)) {
              toolCalls.push({
                name: possibleName,
                arguments: possibleArgs,
              });
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
        toolCalls.push({ name: match[1], arguments: args });
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
      
      toolCalls.push({ name, arguments: args });
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
      
      toolCalls.push({ name, arguments: args });
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
      // Only accept if it matches a known tool name pattern (camelCase/snake_case)
      if (/^[a-z]/.test(name)) {
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
    };

    const updatedMessages = [...messages];

    try {
      // ── Initial analysis state ───────────────────────────────────────────
      // Emit initial "Analyzing user prompt" state before starting work
      this.emit({ type: 'agent:thinking' });
      this.state.status = 'Analyzing user prompt...';

      // ── Auto-summarize if needed ───────────────────────────────────────
      const contextBudget = this.config.contextWindowSize - this.config.maxTokens;
      if (needsSummarization(updatedMessages, contextBudget * 0.7)) {
        this.emit({ type: 'agent:summarizing' });
        this.state.status = 'Summarizing conversation history...';

        // For now, do a simple truncation instead of calling LLM for summary
        // (to avoid recursive API calls). Full summarization can be added later.
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

      // ── Agent iteration loop ─────────────────────────────────────────
      let continueLoop = true;
      const executedToolNames = new Set<string>();

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

        if (this.state.currentIteration > 1) {
          this.state.status = 'Waiting 2s (API rate limit)...';
          this.emit({ type: 'agent:thinking' });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

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
              const parsedCalls = parseToolCallsFromText(afterThink);
              if (parsedCalls.length > 0) {
                // Assign the parsed calls to assistantMsg
                if (!assistantMsg.toolCalls) assistantMsg.toolCalls = [];
                for (const pc of parsedCalls) {
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
                this.state.status = `Executing ${toolCall.name}...`;
                result = await this.toolExecutor(toolCall);
                if (result.success) {
                  executedToolNames.add(toolCall.name);
                }
              } else {
                result = { success: false, output: 'Tool execution was REJECTED by the user.' };
              }

              toolCall.result = result;
              toolCall.status = result.success ? 'completed' : 'error';
              toolCall.durationMs = Date.now() - toolCall.timestamp;

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
          // No tool calls — LLM gave a pure text-only response. We are done.
          // (Unless forceRetry was set by the [SYSTEM ERROR] check above)
          continueLoop = forceRetry;
        }
      }

      // ── Finalize ─────────────────────────────────────────────────────
      this.state.isRunning = false;
      this.state.status = 'done';
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
    } catch (e) {
      console.error('[AgentLoop] Event callback error:', e);
    }
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

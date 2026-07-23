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
              break; // Only parse the first outer valid tool call we find
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

      // ── Context-aware initial exploration ───────────────────────────────
      // If this is the first message in agent mode and we have project context,
      // do a quick exploration to understand the structure before planning
      if (this.config.agentMode && this.projectContext && this.state.currentIteration === 0) {
        this.state.status = 'Exploring project structure...';
        
        // Add a system message to guide the AI to explore first
        const explorationHint = createUserMessage(
          `[SYSTEM]: You are starting a new task. Before making any changes, ` +
          `explore the project structure to understand the codebase. ` +
          `Start by listing the main directories, then read key files to understand the architecture. ` +
          `This context will help you plan the most effective approach.`
        );
        updatedMessages.push(explorationHint);
        this.emit({ type: 'agent:message-added', data: explorationHint });
      }

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
              if (thinkStart !== -1) {
                const thinkEnd = textToDisplay.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  const closeBracket = textToDisplay.indexOf('>', thinkEnd);
                  if (closeBracket !== -1) {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart, closeBracket + 1);
                    textToDisplay = textToDisplay.substring(closeBracket + 1); // Discard everything before!
                  } else {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                    textToDisplay = ''; // Discard everything before!
                  }
                } else {
                  assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                  textToDisplay = ''; // Discard everything before!
                }
              } else if (textToDisplay.trim().startsWith('<') && textToDisplay.length < 20) {
                assistantMsg.thinkingContent = textToDisplay;
                textToDisplay = '';
              }
              
              // 2. Hide tool call blocks (```json) during streaming
              const lowerText = textToDisplay.toLowerCase();
              const jsonStart = lowerText.indexOf('```json');
              
              if (jsonStart !== -1) {
                // Once a tool call starts, we know this is an intermediate step.
                // ALL text outside the thinking block is hallucinated narration and MUST be wiped.
                textToDisplay = '';
              } else {
                const backtickStart = textToDisplay.lastIndexOf('```');
                if (backtickStart !== -1) {
                  textToDisplay = textToDisplay.substring(0, backtickStart);
                }
              }
              
              // 3. Anti-Jumping Buffer
              // We hide textToDisplay if it's short, to give the stream time to reveal 
              // whether it's going to start a <think> block or a ```json block.
              // This completely prevents split-second text bubbles from flashing on screen.
              let hideText = false;
              if (!assistantMsg.thinkingContent && textToDisplay.length < 300) {
                // Buffering startup text to see if a <think> tag arrives
                hideText = true;
              } else if (assistantMsg.thinkingContent && textToDisplay.length < 300) {
                // Buffering post-thinking text to see if a ```json tool call arrives
                hideText = true;
              }
              
              assistantMsg.content = hideText ? '' : textToDisplay.trim();
              
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
              if (thinkStart !== -1) {
                const thinkEnd = textToDisplay.indexOf('</think', thinkStart);
                if (thinkEnd !== -1) {
                  const closeBracket = textToDisplay.indexOf('>', thinkEnd);
                  if (closeBracket !== -1) {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart, closeBracket + 1);
                    textToDisplay = textToDisplay.substring(closeBracket + 1); // Discard everything before!
                  } else {
                    assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                    textToDisplay = ''; // Discard everything before!
                  }
                } else {
                  assistantMsg.thinkingContent = textToDisplay.substring(thinkStart);
                  textToDisplay = ''; // Discard everything before!
                }
              } else if (textToDisplay.trim().startsWith('<') && textToDisplay.length < 20) {
                assistantMsg.thinkingContent = textToDisplay;
                textToDisplay = '';
              }
              
              const lowerText = textToDisplay.toLowerCase();
              const jsonStart = lowerText.indexOf('```json');
              if (jsonStart !== -1) {
                // If there's a tool call, all other text is wiped
                textToDisplay = '';
              } else {
                const backtickStart = textToDisplay.lastIndexOf('```');
                if (backtickStart !== -1) {
                  textToDisplay = textToDisplay.substring(0, backtickStart);
                }
              }
              
              assistantMsg.content = textToDisplay.trim();
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

        // ── Parse tool calls from text (fallback) ────────────────────────
        // IMPORTANT: Always attempt text parsing, even when native tools are used.
        // For models with supportsTools:false (Dispatcher v1), the ONLY way tool
        // calls come through is via this text parser. The shouldUseTools gate was
        // the root cause of tools never executing — we removed it here.
        if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
          const parsedCalls = parseToolCallsFromText(fullResponseText);
          if (parsedCalls.length > 0) {
            // Deduplicate tool calls to prevent redundant executions
            const deduplicatedCalls = deduplicateToolCalls(parsedCalls);
            assistantMsg.toolCalls = deduplicatedCalls.map((pc) => createToolCall(pc.name, pc.arguments));
            // Strip the raw JSON/XML from the displayed text so it doesn't leak
            assistantMsg.content = stripToolCallBlocks(fullResponseText, deduplicatedCalls);
          }
        }

        // ── Force thinking injection if AI didn't emit it ─────────────────
        // If the AI made tool calls but didn't emit <thinking> tags, inject a synthetic
        // thinking step to ensure the UI shows the reasoning process
        const hasThinking = /<think(?:ing)?>/.test(fullResponseText);
        const hasToolCalls = assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0;
        
        if (hasToolCalls && !hasThinking) {
          // Inject a synthetic thinking block BEFORE parsing tool calls
          // This ensures it appears in the correct order in the UI
          const syntheticThinking = `<thinking>
1. UNDERSTAND THE REQUEST: Processing the user's request
2. ANALYZE THE CONTEXT: Analyzing the codebase and available information
3. PLAN THE APPROACH: Determining the best approach using available tools
4. IDENTIFY RISKS: Considering potential issues and edge cases
5. EXECUTE: Calling tools to gather information and make changes
</thinking>`;
          
          // Prepend to fullResponseText BEFORE parsing tool calls
          fullResponseText = syntheticThinking + '\n\n' + fullResponseText;
          
          // Manually extract it to thinkingContent
          assistantMsg.thinkingContent = syntheticThinking;
          
          // Re-parse tool calls with the thinking block included
          const parsedCalls = parseToolCallsFromText(fullResponseText);
          if (parsedCalls.length > 0) {
            const deduplicatedCalls = deduplicateToolCalls(parsedCalls);
            assistantMsg.toolCalls = deduplicatedCalls.map((pc) => createToolCall(pc.name, pc.arguments));
            assistantMsg.content = stripToolCallBlocks(fullResponseText.substring(syntheticThinking.length), deduplicatedCalls);
          }
        }

        // ── Phase 1: Core Isolation Engine - Aggressive Text Stripping ────────
        // If this iteration contains tool calls, it is an intermediate step.
        // We MUST strip all conversational text outside the <think> or <thinking> block
        // to prevent hallucinated code or unnecessary narration from leaking into the UI.
        // Since our streaming parser already separates <thinking> into thinkingContent,
        // we can simply clear the remaining conversational content!
        if (hasToolCalls) {
          assistantMsg.content = '';
        }

        let forceRetry = false;
        
        // ── Detect AI answering without tools when tools are needed ─────────
        const explicitlyClaimsToolCall = /EXECUTE:\s*Call|calling.*tool|use.*tool|let me use/i.test(fullResponseText);
        const lastMsg = updatedMessages[updatedMessages.length - 1];
        const wasJustScolded = lastMsg && lastMsg.role === 'user' && lastMsg.content.includes('[SYSTEM ERROR]');
        
        // Track if it claims to have performed a write action but hasn't actually used a write tool
        const claimsWriteAction = /(?:I|I've|I have)\s+(?:created|wrote|generated|built|added)|(?:has been|was)\s+(?:created|wrote|generated|built|added|successfully)/i.test(fullResponseText);
        const hasWriteToolsExecuted = executedToolNames.has('createFile') || executedToolNames.has('writeFile') || executedToolNames.has('editFile') || executedToolNames.has('runCommand');
        const isHallucinatingWrite = claimsWriteAction && !hasWriteToolsExecuted;

        // Track if it promises to do something but fails to output a tool call
        const claimsFutureAction = /(?:Let me|I will|I'll|I am going to)\s+(?:also\s+)?(?:read|check|examine|look at|create|write|make|build|generate)/i.test(fullResponseText);
        const isFailedAction = claimsFutureAction && !hasToolCalls;

        // General heuristic for first iteration
        const needsTools = /list|read|file|directory|folder|search|find|explore|create|write|make|build|generate/i.test(fullResponseText);
        const isFirstIterationHallucination = this.state.currentIteration === 1 && needsTools && !hasToolCalls;
        
        const isRepeatedHallucination = wasJustScolded && !hasToolCalls;

        if (this.config.agentMode && !hasToolCalls && this.toolDefinitions.length > 0 && 
            (isFirstIterationHallucination || explicitlyClaimsToolCall || isRepeatedHallucination || isHallucinatingWrite || isFailedAction)) {
          
          this.state.consecutiveErrors = (this.state.consecutiveErrors || 0) + 1;
          
          if (this.state.consecutiveErrors >= 3) {
            console.warn('[AgentLoop] Breaking loop due to repeated failure to format tool calls.');
            continueLoop = false;
            
            // Hide the 3rd hallucination as well
            assistantMsg.isHidden = true;
            
            const errorMsg = createAssistantMessage(this.config.model);
            errorMsg.content = 'I encountered a critical error formatting my tool calls and could not complete the action. Please try rephrasing your request.';
            errorMsg.isStreaming = false;
            updatedMessages.push(errorMsg);
            this.emit({ type: 'agent:message-added', data: errorMsg });
          } else {
            // Hide the offending hallucination from the UI so it doesn't clutter the chat
            assistantMsg.isHidden = true;
            
            const correctionMsg = createUserMessage(
              `[SYSTEM ERROR]: You provided a direct answer without using tools, or your tool call was malformed. ` +
              `CRITICAL: If you are claiming to read, create, or modify a file, you MUST actually output the JSON tool call (e.g. readFile, createFile) to do so! ` +
              `Do NOT generate or guess the file contents yourself. You CANNOT do anything without a tool call. ` +
              `Ensure your tool call is in valid JSON or XML format as instructed. ` +
              `Retry this request using the appropriate tools. DO NOT APOLOGIZE. DO NOT EXPLAIN. Output ONLY the tool call.`
            );
            
            // Hide the system error from the UI as well (background correction)
            correctionMsg.isHidden = true;
            
            updatedMessages.push(correctionMsg);
            this.emit({ type: 'agent:message-added', data: correctionMsg });
            forceRetry = true;
          }
        } else if (hasToolCalls) {
          // Reset consecutive errors if it successfully made a tool call
          this.state.consecutiveErrors = 0;
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
          const allToolCalls = [...readOnlyTools, ...writeTools];
          
          for (const toolCall of allToolCalls) {
            if (!this.state.isRunning) break;

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

              // ── Anchor intentionally removed to prevent parroting ──
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

            this.state.currentToolCall = undefined;
          }

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

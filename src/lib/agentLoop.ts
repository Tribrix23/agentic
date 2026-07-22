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
  | 'agent:token-budget';

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

  // ── Format 2: JSON code blocks with tool_call ─────────────────────────
  if (toolCalls.length === 0) {
    const jsonBlockRegex = /```(?:json)?\s*\n?\s*(\{[\s\S]*?"tool_call"[\s\S]*?\})\s*\n?\s*```/gi;
    while ((match = jsonBlockRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const tc = parsed.tool_call || parsed;
        if (tc.name) {
          toolCalls.push({
            name: tc.name,
            arguments: tc.arguments || tc.params || tc.args || {},
          });
        }
      } catch (e) {
        console.warn('[AgentLoop] Failed to parse JSON tool call:', e);
      }
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

  return toolCalls;
}

/**
 * Strip tool call blocks from text to get clean display text.
 */
function stripToolCallBlocks(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{[\s\S]*?"tool_call"[\s\S]*?\}\s*\n?\s*```/gi, '');
  cleaned = cleaned.replace(/\[TOOL:\s*\w+\]\s*```(?:json)?\s*\n?[\s\S]*?\n?\s*```/gi, '');
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
        const shouldUseTools = this.config.agentMode && this.toolDefinitions.length > 0;
        const context = buildContext(
          this.config,
          updatedMessages,
          this.projectContext,
          shouldUseTools ? this.toolDefinitions : undefined
        );

        this.emit({ type: 'agent:token-budget', data: context.tokenBudget });
        this.state.tokenBudget = context.tokenBudget;

        // ── Create assistant message ─────────────────────────────────────
        const assistantMsg = createAssistantMessage(this.config.model);
        assistantMsg.agentIteration = this.state.currentIteration;
        updatedMessages.push(assistantMsg);

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
            messages: context.messages,
            tools: shouldUseTools ? this.toolDefinitions : undefined,
            onChunk: (chunk: string) => {
              fullResponseText += chunk;
              assistantMsg.content = fullResponseText;
              assistantMsg.isStreaming = true;
              this.emit({ type: 'agent:streaming', data: { text: chunk, fullText: fullResponseText } });
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
              assistantMsg.content = fullText;
              assistantMsg.isStreaming = false;
              assistantMsg.durationMs = Date.now() - startTime;
              assistantMsg.tokensUsed = estimateTokens(fullText);
              resolve();
            },
            checkIsStreaming: () => this.state.isRunning,
            signal: this.abortController?.signal,
          });
        });

        // ── Parse tool calls from text (fallback) ────────────────────────
        if (!assistantMsg.toolCalls || assistantMsg.toolCalls.length === 0) {
          const parsedCalls = parseToolCallsFromText(fullResponseText);
          if (parsedCalls.length > 0) {
            assistantMsg.toolCalls = parsedCalls.map((pc) => createToolCall(pc.name, pc.arguments));
            // Clean the display text
            assistantMsg.content = stripToolCallBlocks(fullResponseText);
          }
        }

        // ── Process tool calls ─────────────────────────────────────────
        if (
          assistantMsg.toolCalls &&
          assistantMsg.toolCalls.length > 0 &&
          this.toolExecutor &&
          this.state.isRunning
        ) {
          for (const toolCall of assistantMsg.toolCalls) {
            if (!this.state.isRunning) break;

            this.state.status = `Executing ${toolCall.name}...`;
            this.state.currentToolCall = toolCall;
            this.emit({ type: 'agent:tool-executing', data: toolCall });

            try {
              const result = await this.toolExecutor(toolCall);
              toolCall.result = result;
              toolCall.status = result.success ? 'completed' : 'error';
              toolCall.durationMs = Date.now() - toolCall.timestamp;

              this.emit({ type: 'agent:tool-result', data: { toolCall, result } });

              // Add tool result message for next iteration
              const toolMsg = createToolMessage(toolCall.id, toolCall.name, result);
              updatedMessages.push(toolMsg);
            } catch (error: any) {
              toolCall.status = 'error';
              toolCall.result = {
                success: false,
                output: `Tool execution failed: ${error.message}`,
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
            }

            this.state.currentToolCall = undefined;
          }

          // Continue loop to let LLM process tool results
          continueLoop = true;
        } else {
          // No tool calls — LLM gave a text-only response, we're done
          continueLoop = false;
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

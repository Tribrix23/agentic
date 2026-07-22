// ============================================================================
// API Layer — Refactored for dynamic configuration & tool call support
// ============================================================================

import { AIConfig, DEFAULT_AI_CONFIG, buildSystemPrompt } from './lib/aiConfig';
import { ToolCall, createToolCall } from './lib/messageTypes';

// ── Legacy exports for backward compatibility ──────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── New API interfaces ─────────────────────────────────────────────────────

export interface DispatcherAPIParams {
  config: AIConfig;
  messages: ChatMessage[];
  tools?: any[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  onChunk: (chunk: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onError: (error: Error) => void;
  onSuccess: (fullText: string) => void;
  checkIsStreaming: () => boolean;
  signal?: AbortSignal;
}

// ── Legacy-compatible interface (for existing code that hasn't migrated) ───

interface LegacyDispatcherParams {
  model: string;
  messages: ChatMessage[];
  onChunk: (chunk: string) => void;
  onError: (error: string) => void;
  onSuccess?: (fullText: string) => void;
  checkIsStreaming: () => boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ENDPOINT = 'https://quantix.api.devctr.com/api/dispatcher';

// ── Main API Function ──────────────────────────────────────────────────────

export const callDispatcherAPI = async (params: DispatcherAPIParams | LegacyDispatcherParams) => {
  // ── Detect legacy vs new format ─────────────────────────────────────
  const isLegacy = 'model' in params && !('config' in params);

  let config: AIConfig;
  let messages: ChatMessage[];
  let tools: any[] | undefined;
  let toolChoice: any;
  let onChunk: (chunk: string) => void;
  let onToolCall: ((toolCall: ToolCall) => void) | undefined;
  let onError: (error: Error) => void;
  let onSuccess: (fullText: string) => void;
  let checkIsStreaming: () => boolean;
  let signal: AbortSignal | undefined;

  if (isLegacy) {
    const p = params as LegacyDispatcherParams;
    config = { ...DEFAULT_AI_CONFIG, model: p.model };
    messages = p.messages;
    onChunk = p.onChunk;
    onError = (err: Error) => p.onError(err.message);
    onSuccess = p.onSuccess || (() => {});
    checkIsStreaming = p.checkIsStreaming;
  } else {
    const p = params as DispatcherAPIParams;
    config = p.config;
    messages = p.messages;
    tools = p.tools;
    toolChoice = p.toolChoice;
    onChunk = p.onChunk;
    onToolCall = p.onToolCall;
    onError = p.onError;
    onSuccess = p.onSuccess;
    checkIsStreaming = p.checkIsStreaming;
    signal = p.signal;
  }

  // ── Build request payload ──────────────────────────────────────────
  const payload: Record<string, any> = {
    model: config.model,
    conversation_id: `conv_${Date.now()}`,
    messages,
    temperature: config.temperature,
    top_p: config.topP,
    max_tokens: config.maxTokens,
    stream: config.stream,
    imageUrl: [] as string[],
    videoUrl: [] as string[],
  };

  // ── Optional parameters (only include if non-default) ───────────────
  if (config.topK !== 40) {
    payload.top_k = config.topK;
  }
  if (config.frequencyPenalty !== 0) {
    payload.frequency_penalty = config.frequencyPenalty;
  }
  if (config.presencePenalty !== 0) {
    payload.presence_penalty = config.presencePenalty;
  }
  if (config.stopSequences.length > 0) {
    payload.stop = config.stopSequences;
  }
  if (config.responseFormat === 'json') {
    payload.response_format = { type: 'json_object' };
  }

  // ── Tool definitions ────────────────────────────────────────────────
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = toolChoice || 'auto';
  }

  // ── Retry logic with exponential backoff ──────────────────────────
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (signal?.aborted) {
      onError(new Error('Request aborted'));
      return;
    }

    if (attempt > 0) {
      const delay = config.retryDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const apiKey = (import.meta as any).env?.VITE_QUANTIX_API_KEY;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

      // Chain signals: user abort + timeout
      if (signal) {
        signal.addEventListener('abort', () => controller.abort());
      }

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || response.statusText;

        if (response.status >= 500 && attempt < config.maxRetries) {
          lastError = new Error(`Server error (${response.status}): ${errorMsg}`);
          continue; // Retry on server errors
        }

        onError(new Error(`API Error (${response.status}): ${errorMsg}`));
        return;
      }

      // ── Handle streaming response ────────────────────────────────────
      if (config.stream && response.body) {
        await handleStreamingResponse(
          response,
          onChunk,
          onToolCall,
          onSuccess,
          checkIsStreaming,
          config.streamChunkDelay
        );
      } else {
        // ── Handle non-streaming response ──────────────────────────────
        const data = await response.json();
        const message = data.choices?.[0]?.message;

        if (message) {
          // Check for structured tool calls
          if (message.tool_calls && message.tool_calls.length > 0 && onToolCall) {
            for (const tc of message.tool_calls) {
              const toolCall = createToolCall(
                tc.function?.name || tc.name,
                typeof tc.function?.arguments === 'string'
                  ? JSON.parse(tc.function.arguments)
                  : tc.function?.arguments || tc.arguments || {}
              );
              onToolCall(toolCall);
            }
          }

          const content = message.content || '';
          if (content) onChunk(content);
          onSuccess(content);
        }
      }

      return; // Success — exit retry loop

    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (signal?.aborted) {
          onError(new Error('Request aborted by user'));
        } else {
          onError(new Error(`Request timed out after ${config.timeoutMs}ms`));
        }
        return;
      }

      lastError = error;

      if (attempt < config.maxRetries) {
        console.warn(`[API] Attempt ${attempt + 1} failed, retrying...`, error.message);
        continue;
      }
    }
  }

  // ── All retries exhausted — fall back to mock ───────────────────────
  console.warn('[API] All retries exhausted, falling back to mock response');
  await handleMockFallback(onChunk, onSuccess, checkIsStreaming);
};

// ── Stream Handler ─────────────────────────────────────────────────────────

async function handleStreamingResponse(
  response: Response,
  onChunk: (chunk: string) => void,
  onToolCall: ((toolCall: ToolCall) => void) | undefined,
  onSuccess: (fullText: string) => void,
  checkIsStreaming: () => boolean,
  chunkDelay: number
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullContent = '';
  let pendingToolCalls: Record<number, { name: string; arguments: string }> = {};

  try {
    while (true) {
      if (!checkIsStreaming()) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const dataStr = line.replace('data: ', '').trim();
          if (!dataStr || dataStr === 'keep-alive') continue;

          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta;

            if (delta) {
              // ── Handle text content ────────────────────────────────
              if (delta.content) {
                fullContent += delta.content;
                onChunk(delta.content);
              }

              // ── Handle structured tool calls (streaming) ───────────
              if (delta.tool_calls && onToolCall) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!pendingToolCalls[idx]) {
                    pendingToolCalls[idx] = { name: '', arguments: '' };
                  }
                  if (tc.function?.name) {
                    pendingToolCalls[idx].name = tc.function.name;
                  }
                  if (tc.function?.arguments) {
                    pendingToolCalls[idx].arguments += tc.function.arguments;
                  }
                }
              }
            }

            // Check for finish_reason to emit completed tool calls
            const finishReason = data.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' || finishReason === 'stop') {
              for (const [, tc] of Object.entries(pendingToolCalls)) {
                if (tc.name && onToolCall) {
                  try {
                    const args = tc.arguments ? JSON.parse(tc.arguments) : {};
                    onToolCall(createToolCall(tc.name, args));
                  } catch (e) {
                    console.warn('[API] Failed to parse streamed tool call args:', e);
                  }
                }
              }
              pendingToolCalls = {};
            }
          } catch (e) {
            // Ignore JSON parse errors on partial chunks
          }
        }
      }

      // Optional rendering delay
      if (chunkDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, chunkDelay));
      }
    }
  } finally {
    reader.releaseLock();
  }

  onSuccess(fullContent);
}

// ── Mock Fallback ──────────────────────────────────────────────────────────

async function handleMockFallback(
  onChunk: (chunk: string) => void,
  onSuccess: (fullText: string) => void,
  checkIsStreaming: () => boolean
): Promise<void> {
  const mockResponse =
    "Hello! I'm QUANTIX AI running in offline mode because the API endpoint was unreachable.\n\n" +
    "The agentic system, streaming UI, and all chat features are working correctly. " +
    "Once connected to the API, I'll be able to:\n" +
    "- Read and analyze your project files\n" +
    "- Write and edit code\n" +
    "- Run terminal commands\n" +
    "- Manage Git operations\n\n" +
    "How can I help you?";

  let currentText = '';
  const words = mockResponse.split(' ');

  for (let i = 0; i < words.length; i++) {
    if (!checkIsStreaming()) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const space = i === 0 ? '' : ' ';
    currentText += space + words[i];
    onChunk(space + words[i]);
  }

  onSuccess(currentText);
}

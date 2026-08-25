import { afterEach, describe, expect, it, vi } from 'vitest';
import { callDispatcherAPI } from '../../api';
import { DEFAULT_AI_CONFIG } from '../aiConfig';

function responseWithReader(reader: ReadableStreamDefaultReader<Uint8Array>): Response {
  return {
    ok: true,
    body: { getReader: () => reader, cancel: () => Promise.resolve() } as unknown as ReadableStream<Uint8Array>,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('callDispatcherAPI streaming lifecycle', () => {
  it('reports cancellation when the consumer stops during body streaming', async () => {
    const reader = {
      read: vi.fn().mockResolvedValue({ done: false, value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n') }),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn(),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;
    const fetchMock = vi.fn(async (url: string) => url.includes('/calls')
      ? new Response(JSON.stringify({ tempApiKey: 'test-key', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }), { status: 200 })
      : responseWithReader(reader));
    vi.stubGlobal('fetch', fetchMock);

    let streaming = true;
    const onError = vi.fn();
    await callDispatcherAPI({
      config: { ...DEFAULT_AI_CONFIG, stream: true, maxRetries: 0 },
      messages: [{ role: 'user', content: 'test' }],
      onChunk: () => { streaming = false; },
      onError,
      onSuccess: vi.fn(),
      checkIsStreaming: () => streaming,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
    expect(reader.cancel).toHaveBeenCalled();
  });

  it('keeps the request timeout active while the response body is stalled', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/calls')) {
        return new Response(JSON.stringify({ tempApiKey: 'test-key', expiresAt: new Date(Date.now() + 3_600_000).toISOString() }), { status: 200 });
      }
      return responseWithReader({
        read: () => new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })),
        cancel: vi.fn().mockResolvedValue(undefined),
        releaseLock: vi.fn(),
      } as unknown as ReadableStreamDefaultReader<Uint8Array>);
    });
    vi.stubGlobal('fetch', fetchMock);

    const onError = vi.fn();
    await callDispatcherAPI({
      config: { ...DEFAULT_AI_CONFIG, stream: true, timeoutMs: 10, maxRetries: 0 },
      messages: [{ role: 'user', content: 'test' }],
      onChunk: vi.fn(),
      onError,
      onSuccess: vi.fn(),
      checkIsStreaming: () => true,
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Request timed out after 10ms' }));
  });
});

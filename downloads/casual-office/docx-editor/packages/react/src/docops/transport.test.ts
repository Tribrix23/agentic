/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it, afterEach } from 'bun:test';
import { DesktopTransport, CollabTransport } from './transport';
import type { LlmCallPayload } from './transport';

const payload = (): LlmCallPayload => ({
  model: 'local',
  max_tokens: 128,
  system: 'sys',
  messages: [{ role: 'user', content: 'summarize' }],
  tools: [],
});

describe('DesktopTransport (local model)', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
  });

  it('is single-round (drivesLoop=false) so the Agent toggle shows on desktop', () => {
    // The Agent toggle + runAgent path are gated on !transport.drivesLoop; if
    // this regresses to true the agent silently stops running on the local model.
    expect(new DesktopTransport().drivesLoop).toBe(false);
  });

  it('calls the Rust worker exactly once and returns its native tool_use response', async () => {
    let invokeCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sent: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      __TAURI_INTERNALS__: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        invoke: async (cmd: string, a: any) => {
          invokeCount += 1;
          sent = { cmd, a };
          return {
            content: [{ type: 'tool_use', id: 't1', name: 'get_outline', input: {} }],
            stop_reason: 'tool_use',
          };
        },
      },
    };

    const res = await new DesktopTransport().call(payload());

    // Single round — the panel / agent drives the multi-round loop, not the
    // transport. Returning here (rather than looping) is what makes the agent work.
    expect(invokeCount).toBe(1);
    expect(sent.cmd).toBe('docops_llm_call');
    expect(sent.a.args.maxTokens).toBe(128);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = res.data as any;
    expect(data.content[0].name).toBe('get_outline');
    expect(data.stop_reason).toBe('tool_use');
  });

  it('surfaces a worker error as status 500', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {
      __TAURI_INTERNALS__: {
        invoke: async () => {
          throw new Error('model not loaded');
        },
      },
    };
    const res = await new DesktopTransport().call(payload());
    expect(res.status).toBe(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res.data as any).error.message).toContain('model not loaded');
  });
});

describe('CollabTransport (single-round, web AI proxy)', () => {
  const origWs = (globalThis as { WebSocket?: unknown }).WebSocket;
  afterEach(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = origWs;
  });

  it('is single-round (drivesLoop=false) so the Agent toggle shows on web', () => {
    // Previously true — which hid the agent on ALL web sessions. Guard it.
    expect(new CollabTransport('ws://x/api/ai').drivesLoop).toBe(false);
  });

  it('sends singleRound and resolves the round frame as a native response', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sent: any;
    class MockWS {
      listeners: Record<string, ((a?: unknown) => void)[]> = {};
      constructor(_url: string) {
        queueMicrotask(() => this.emit('open'));
      }
      addEventListener(ev: string, cb: (a?: unknown) => void) {
        (this.listeners[ev] ||= []).push(cb);
      }
      removeEventListener() {}
      emit(ev: string, arg?: unknown) {
        (this.listeners[ev] || []).forEach((cb) => cb(arg));
      }
      send(data: string) {
        sent = JSON.parse(data);
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              type: 'round',
              content: [{ type: 'tool_use', id: 't', name: 'get_outline', input: {} }],
              stop_reason: 'tool_use',
            }),
          })
        );
      }
      close() {}
    }
    (globalThis as { WebSocket?: unknown }).WebSocket = MockWS as unknown;

    const res = await new CollabTransport('ws://x/api/ai', 'room1').call({
      model: 'm',
      max_tokens: 100,
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    } as LlmCallPayload);

    expect(sent.singleRound).toBe(true);
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = res.data as any;
    expect(data.content[0].name).toBe('get_outline');
    expect(data.stop_reason).toBe('tool_use');
  });
});

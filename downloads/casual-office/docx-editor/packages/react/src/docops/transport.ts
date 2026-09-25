/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 *
 * Transport abstraction for DocOps LLM calls.
 *
 * Three concrete implementations:
 *  - DirectTransport  — browser fetch straight to Anthropic (Phase 0/1 default)
 *  - CollabTransport  — WebSocket to the collab server; SERVER holds the LLM
 *                       tool loop and routes tool_call messages back to this
 *                       client, which executes them via DocsBridge
 *  - DesktopTransport — Tauri invoke (native HTTP, keychain-ready)
 *
 * CollabTransport.drivesLoop === true: call() drives the complete multi-round
 * conversation internally. DirectTransport and DesktopTransport return a
 * single LLM round; the panel loops externally for those.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface LlmCallPayload {
  model: string;
  system: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: any;
  max_tokens: number;
  /** API key — required for DirectTransport; optional when the server holds one. */
  apiKey?: string;
  // ── collab-loop extras (only used when transport.drivesLoop === true) ──
  /** Executes a tool on behalf of the server and returns the result. */
  toolExecutor?: ToolExecutor;
  /** Called for each text block streamed by the server. */
  onText?: (text: string) => void;
  /** Abort signal — close the WS when aborted. */
  signal?: AbortSignal;
  /**
   * Maximum number of tool-call rounds before the loop is stopped.
   * Defaults to 12 when omitted.
   */
  maxToolRounds?: number;
}

export interface LlmCallResult {
  /** Raw LLM response, or a synthetic `{ok:true}` for loop-driving transports. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  /** HTTP/WS status code. */
  status: number;
  /** Full conversation history after all tool rounds (only set by CollabTransport). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedHistory?: any[];
  /** True when the loop was stopped because it hit the maxToolRounds cap. */
  capHit?: boolean;
}

export interface DocOpsTransport {
  call(payload: LlmCallPayload): Promise<LlmCallResult>;
  /** True when an API key UI should be shown to the user. */
  readonly requiresApiKey: boolean;
  /**
   * True when the transport drives the full multi-round tool loop internally.
   * The panel must NOT run its own loop for these transports.
   */
  readonly drivesLoop: boolean;
}

// ── DirectTransport ────────────────────────────────────────────────────────

export class DirectTransport implements DocOpsTransport {
  readonly requiresApiKey = true;
  readonly drivesLoop = false;

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    if (!payload.apiKey) {
      return { data: { error: { message: 'No API key configured.' } }, status: 401 };
    }

    const useStream = !!payload.onText;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': payload.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model,
        max_tokens: payload.max_tokens,
        system: payload.system,
        messages: payload.messages,
        tools: payload.tools,
        ...(useStream ? { stream: true } : {}),
      }),
      signal: payload.signal,
    });

    // Surface the real Anthropic error instead of trying to parse an error
    // body as an SSE stream (which yields a bare "API error 400"). The error
    // body is JSON even on the streaming endpoint when the request is rejected.
    if (!resp.ok) {
      let data: unknown;
      try {
        data = await resp.json();
      } catch {
        data = { error: { message: `Anthropic API error ${resp.status}` } };
      }
      return { data, status: resp.status };
    }

    if (!useStream || !resp.body) {
      return { data: await resp.json(), status: resp.status };
    }

    // Parse Anthropic SSE stream.
    // Events: content_block_start (type=text), content_block_delta (text_delta),
    // content_block_stop, message_delta (stop_reason), message_stop.
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let msgDelta: any = {};

    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break outer;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let ev: any;
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }

          if (ev.type === 'content_block_start' && ev.content_block?.type === 'text') {
            content.push({ type: 'text', text: '' });
          } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
            content.push({
              type: 'tool_use',
              id: ev.content_block.id,
              name: ev.content_block.name,
              input: {},
            });
          } else if (ev.type === 'content_block_delta') {
            const last = content[content.length - 1];
            if (ev.delta?.type === 'text_delta' && last?.type === 'text') {
              last.text += ev.delta.text ?? '';
              payload.onText?.(ev.delta.text ?? '');
            } else if (ev.delta?.type === 'input_json_delta' && last?.type === 'tool_use') {
              last._inputStr = (last._inputStr ?? '') + (ev.delta.partial_json ?? '');
            }
          } else if (ev.type === 'content_block_stop') {
            const last = content[content.length - 1];
            if (last?.type === 'tool_use' && last._inputStr) {
              try {
                last.input = JSON.parse(last._inputStr);
              } catch {
                /* leave empty */
              }
              delete last._inputStr;
            }
          } else if (ev.type === 'message_delta') {
            msgDelta = ev.delta ?? {};
          }
        }
      }
    } catch (err) {
      return { data: { error: { message: String(err) } }, status: 500 };
    }

    return {
      data: { content, stop_reason: msgDelta.stop_reason ?? 'end_turn' },
      status: resp.status,
    };
  }
}

// ── CollabTransport ────────────────────────────────────────────────────────

/**
 * Routes AI orchestration through the collab server's `/api/ai` WebSocket.
 * The server holds the full LLM tool loop; when the model requests a tool
 * call, the server sends `{type:'tool_call', id, toolName, args}` back down
 * the same socket. This client executes the tool via `payload.toolExecutor`
 * and returns `{type:'tool_result', id, result}`. Text blocks stream as
 * `{type:'text', text}`. When the loop ends the server sends
 * `{type:'done', history}` and closes the connection.
 */
export class CollabTransport implements DocOpsTransport {
  readonly requiresApiKey = false;
  // Single round per call() — the panel (chat) and runAgent (agent mode) drive
  // the tool loop; the collab server is just a key-holding LLM proxy for one
  // turn. Previously drivesLoop=true ceded the whole loop to the server, which
  // hid the Agent toggle (gated on !drivesLoop) so the agent never ran on web.
  readonly drivesLoop = false;

  constructor(
    /** WebSocket URL for the AI endpoint, e.g. "wss://collab.example.com/api/ai". */
    private readonly aiWsUrl: string,
    /** Room name — included in the chat init so the server can broadcast presence. */
    private readonly room?: string
  ) {}

  call(payload: LlmCallPayload): Promise<LlmCallResult> {
    return new Promise((resolve, reject) => {
      // Abort before even opening the socket.
      if (payload.signal?.aborted) {
        reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(this.aiWsUrl);
      } catch (err) {
        reject(new Error(`Failed to open AI WebSocket: ${String(err)}`));
        return;
      }

      let settled = false;

      const settle = (v: LlmCallResult | null, err?: Error) => {
        if (settled) return;
        settled = true;
        payload.signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve(v!);
      };

      const onAbort = () => {
        try {
          ws.close(1000, 'aborted');
        } catch {
          /* ignore */
        }
        settle(null, Object.assign(new Error('AbortError'), { name: 'AbortError' }));
      };
      payload.signal?.addEventListener('abort', onAbort);

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            type: 'chat',
            model: payload.model,
            max_tokens: payload.max_tokens,
            system: payload.system,
            messages: payload.messages,
            tools: payload.tools,
            singleRound: true,
            ...(payload.apiKey ? { apiKey: payload.apiKey } : {}),
            ...(this.room ? { roomName: this.room } : {}),
          })
        );
      });

      ws.addEventListener('message', ({ data }: MessageEvent<string>) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data) as Record<string, unknown>;
        } catch {
          settle(null, new Error('AI WS: received non-JSON frame'));
          ws.close();
          return;
        }

        if (msg.type === 'round') {
          // Single-round reply: the panel/agent drives the loop from here.
          settle({
            data: {
              content: msg.content ?? [],
              stop_reason: (msg.stop_reason as string) ?? 'end_turn',
            },
            status: 200,
          });
        } else if (msg.type === 'text') {
          payload.onText?.(msg.text as string);
        } else if (msg.type === 'tool_call') {
          const id = msg.id as string;
          const toolName = msg.toolName as string;
          const args = (msg.args ?? {}) as Record<string, unknown>;

          if (!payload.toolExecutor) {
            ws.send(
              JSON.stringify({
                type: 'tool_result',
                id,
                error: 'no toolExecutor configured on this client',
              })
            );
            return;
          }

          payload
            .toolExecutor(toolName, args)
            .then((result) => {
              ws.send(JSON.stringify({ type: 'tool_result', id, result }));
            })
            .catch((err) => {
              ws.send(
                JSON.stringify({
                  type: 'tool_result',
                  id,
                  error: err instanceof Error ? err.message : String(err),
                })
              );
            });
        } else if (msg.type === 'done') {
          settle({
            data: { ok: true },
            status: 200,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            updatedHistory: msg.history as any[],
            capHit: msg.capHit === true,
          });
        } else if (msg.type === 'error') {
          settle({
            data: { error: { message: msg.message as string } },
            status: 500,
          });
        }
      });

      ws.addEventListener('error', () => {
        settle(null, new Error('AI WebSocket connection failed'));
      });

      ws.addEventListener('close', ({ code, reason }: CloseEvent) => {
        if (!settled) {
          if (code === 1000 || reason === 'aborted') return; // normal or intentional
          settle(null, new Error(`AI WebSocket closed unexpectedly (${code})`));
        }
      });
    });
  }
}

// ── DesktopTransport ───────────────────────────────────────────────────────

/**
 * Routes AI orchestration through the Tauri `docops_llm_call` command.
 * The LLM endpoint and key never touch the webview — the Rust side reads
 * them from env vars (LLM_ENDPOINT / LLM_API_KEY / ANTHROPIC_API_KEY).
 *
 * Drives the full multi-round tool loop in JS (drivesLoop=true): each LLM
 * round calls Rust via invoke, tool_use blocks are executed locally via
 * payload.toolExecutor, and the loop continues until end_turn or the step
 * cap. This mirrors the CollabTransport pattern without a WS round-trip —
 * no Rust changes are required.
 *
 * Falls back to DirectTransport when running outside the Tauri shell.
 */
export class DesktopTransport implements DocOpsTransport {
  readonly requiresApiKey = false;
  // Single round per call() — the panel (chat) and runAgent (agent mode) drive
  // the multi-round tool loop, exactly like DirectTransport. Previously this was
  // drivesLoop=true with a JS runLoop, which hid the Agent toggle on desktop
  // (gated on !drivesLoop) so the plan→execute→reflect agent NEVER ran on the
  // local model. The panel's else-branch ("Direct / Desktop transport: panel
  // drives the loop") already handles single-round desktop calls.
  readonly drivesLoop = false;

  async call(payload: LlmCallPayload): Promise<LlmCallResult> {
    if (payload.signal?.aborted) {
      return Promise.reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    }

    const tauri = (
      window as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;

    if (!tauri?.invoke) {
      return new DirectTransport().call(payload);
    }
    const invoke = tauri.invoke.bind(tauri);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    try {
      // One model turn. The Rust command takes a single `args` struct
      // (docops_llm_call(args: DocopsLlmArgs)); a bare object throws "missing
      // required key args". It returns { content: [...blocks], stop_reason } —
      // the same shape DirectTransport yields, with native tool_use blocks.
      data = await invoke('docops_llm_call', {
        args: {
          model: payload.model,
          system: payload.system,
          messages: payload.messages,
          tools: payload.tools,
          maxTokens: payload.max_tokens,
          apiKey: payload.apiKey ?? '',
        },
      });
    } catch (err) {
      return { data: { error: { message: String(err) } }, status: 500 };
    }

    // Surface text blocks via onText (the worker returns them complete, not
    // token-streamed).
    if (Array.isArray(data?.content)) {
      for (const block of data.content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          payload.onText?.(block.text);
        }
      }
    }

    return {
      data: { content: data?.content ?? [], stop_reason: data?.stop_reason ?? 'end_turn' },
      status: 200,
    };
  }
}

// ── factory ────────────────────────────────────────────────────────────────

/**
 * Picks the right transport for the current environment.
 *  - Desktop (Tauri)   → DesktopTransport
 *  - Collab (ws URL)   → CollabTransport (derives /api/ai WS URL from the Yjs URL)
 *  - Otherwise         → DirectTransport
 */
export function createDocOpsTransport(opts?: {
  collabWsUrl?: string;
  /** Room name for presence broadcasting. Only used with CollabTransport. */
  room?: string;
}): DocOpsTransport {
  const isDesktop = !!(window as { __deskApp__?: { isDesktop?: boolean } }).__deskApp__?.isDesktop;

  if (isDesktop) return new DesktopTransport();

  if (opts?.collabWsUrl) {
    // wss://host/yjs  →  wss://host/api/ai
    // ws://host/yjs   →  ws://host/api/ai
    const aiWsUrl = opts.collabWsUrl.replace(/\/yjs$/, '').replace(/\/+$/, '') + '/api/ai';
    return new CollabTransport(aiWsUrl, opts.room);
  }

  return new DirectTransport();
}

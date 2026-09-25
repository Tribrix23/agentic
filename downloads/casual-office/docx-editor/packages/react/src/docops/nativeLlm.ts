/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * One-shot text completions against the desktop native model.
 *
 * The editor's inline AI actions (Rewrite / Summarize / Ask AI) were written
 * for the browser WebLLM "writer" tier, which the desktop shell never loads.
 * On desktop the only AI backend is the native llama.cpp `ai-worker`, reachable
 * through the `docops_llm_call` Tauri command (the same command the DocOps
 * transport uses). These helpers let the inline actions send a prompt to that
 * model and get plain text back, so they work with the model the user loaded.
 *
 * Web builds keep the WebLLM path — these helpers only activate under Tauri.
 */

type TauriInvoke = (cmd: string, args?: unknown) => Promise<unknown>;

function tauriInvoke(): TauriInvoke | null {
  const t = (window as { __TAURI__?: { core?: { invoke?: TauriInvoke } } }).__TAURI__;
  return t?.core?.invoke ?? null;
}

/** True when running inside the desktop (Tauri) shell. */
export function isDesktopShell(): boolean {
  return !!(window as { __TAURI__?: unknown }).__TAURI__;
}

/** The id of the currently loaded native model, or null if none is loaded. */
export async function nativeActiveModel(): Promise<string | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  try {
    return (await invoke('ai_get_active_model')) as string | null;
  } catch {
    return null;
  }
}

/**
 * Send a single prompt to the loaded native model and return the assistant's
 * text. Throws a user-facing message if no model is loaded.
 */
export async function callNativeText(
  system: string,
  userText: string,
  opts?: { maxTokens?: number }
): Promise<string> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error('Native AI is only available in the desktop app.');
  const model = await nativeActiveModel();
  if (!model) {
    throw new Error('No model is loaded — open AI settings and load a model first.');
  }
  // The Rust command takes a single `args` struct parameter, so the payload
  // MUST be wrapped in `args` (a bare object throws "missing required key args").
  const data = await invoke('docops_llm_call', {
    args: {
      model,
      system,
      messages: [{ role: 'user', content: userText }],
      tools: [],
      maxTokens: opts?.maxTokens ?? 1024,
      apiKey: '',
    },
  });
  return extractAnthropicText(data);
}

/** Pull the concatenated text out of an Anthropic-shaped `{ content: [...] }`. */
function extractAnthropicText(data: unknown): string {
  const content = (data as { content?: unknown })?.content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b &&
          (b as { type?: string }).type === 'text' &&
          typeof (b as { text?: string }).text === 'string'
      )
      .map((b) => b.text)
      .join('')
      .trim();
  }
  return typeof data === 'string' ? data.trim() : '';
}

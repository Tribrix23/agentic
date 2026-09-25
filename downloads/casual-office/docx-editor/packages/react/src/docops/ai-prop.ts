/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import type { DocOpsResult } from '@casualoffice/docops';
import type { DocsBridge } from './bridge';
import type { DocOpsTransport } from './transport';

/**
 * A document action performed by the DocOps assistant — one successful run of
 * a write tool (e.g. `rewrite_selection`, `insert_toc`, `set_paragraph_style`).
 * Read-only tools (searches, stats, outline) never surface here.
 */
export interface DocOpsAction {
  /** The DocOps tool that ran. */
  type: string;
  /** The arguments the assistant passed to the tool. */
  args: Record<string, unknown>;
  /** The tool's result. */
  result: DocOpsResult;
}

/**
 * Supported SDK surface for the built-in DocOps AI assistant.
 *
 * Passing `ai={{ enabled: true }}` unlocks the assistant panel — no
 * `window.__casualFeatures__.docops` global required (that global remains a
 * deprecated fallback for one minor).
 */
export interface AiProp {
  /**
   * Unlock the DocOps assistant panel. When omitted, the assistant is gated
   * behind the deprecated `window.__casualFeatures__.docops` global (or the
   * desktop shell).
   */
  enabled?: boolean;
  /**
   * LLM transport. Controls how model calls are routed:
   *   - Omit → auto-selected via `createDocOpsTransport` (DesktopTransport in
   *     Tauri, DirectTransport otherwise)
   *   - `CollabTransport` → proxy through the collab server's /api/ai/chat
   *   - Any `DocOpsTransport` implementation
   * The explicit `docopsTransport` prop, when set, takes precedence.
   */
  transport?: DocOpsTransport;
  /** Called after the assistant performs a document write action. */
  onAction?: (action: DocOpsAction) => void;
}

/**
 * DocOps tools that only inspect the document. Runs of these never fire
 * `onAction`. New tools default to "mutating" so a consumer's `onAction` is
 * notified unless a tool is explicitly listed here as read-only.
 */
const READ_ONLY_TOOLS = new Set<string>([
  'get_outline',
  'get_selection',
  'get_doc_stats',
  'get_block',
  'search_document',
  'search_workspace',
  'list_styles',
  'find_text',
]);

/**
 * Wrap a {@link DocsBridge} so `onAction` fires after each successful write-tool
 * run. Read-only tool runs are ignored. Returns the bridge unchanged when no
 * callback is supplied.
 *
 * Implemented as a Proxy so the granular per-tool seam works without the
 * DocOpsPanel needing to know about `onAction`.
 */
export function withActionNotifier(
  bridge: DocsBridge,
  onAction?: (action: DocOpsAction) => void
): DocsBridge {
  if (!onAction) return bridge;
  return new Proxy(bridge, {
    get(target, prop, receiver) {
      if (prop === 'callTool') {
        return async (name: string, args: Record<string, unknown>) => {
          const result = await target.callTool(name, args);
          if (result.ok && !READ_ONLY_TOOLS.has(name)) {
            try {
              onAction({ type: name, args, result });
            } catch {
              /* consumer callback threw — non-fatal, don't break the loop */
            }
          }
          return result;
        };
      }
      // Bind methods to the real bridge so private-field access keeps working
      // (Proxy + private fields otherwise throws when `this` is the proxy).
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

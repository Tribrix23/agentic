/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useDialogs — a tiny registry for modal open/close state.
 *
 * DocxEditor historically carried ~16 separate `const [showX, setShowX] =
 * useState(false)` booleans for its modal dialogs. This hook holds them all in
 * one place (a Set of open dialog names) so dialog state is managed centrally —
 * enabling `closeAll()`, and cutting a pile of near-identical useState hooks out
 * of the god-component. See docs/internal/40 (DocxEditor decomposition, batch 1).
 *
 * Pure set transitions live in `dialogsReducer` so they're unit-testable without
 * a React renderer.
 */

import { useCallback, useMemo, useReducer } from 'react';

export type DialogAction =
  | { type: 'open'; name: string }
  | { type: 'close'; name: string }
  | { type: 'toggle'; name: string }
  | { type: 'closeAll' };

/** Pure, unit-testable state transition. Returns the SAME set when nothing
 *  changes so React can bail out of a no-op update. */
export function dialogsReducer(
  open: ReadonlySet<string>,
  action: DialogAction
): ReadonlySet<string> {
  switch (action.type) {
    case 'open': {
      if (open.has(action.name)) return open;
      const next = new Set(open);
      next.add(action.name);
      return next;
    }
    case 'close': {
      if (!open.has(action.name)) return open;
      const next = new Set(open);
      next.delete(action.name);
      return next;
    }
    case 'toggle': {
      const next = new Set(open);
      if (next.has(action.name)) next.delete(action.name);
      else next.add(action.name);
      return next;
    }
    case 'closeAll':
      return open.size === 0 ? open : new Set();
  }
}

export interface DialogsApi {
  /** True while the named dialog is open. */
  isOpen: (name: string) => boolean;
  open: (name: string) => void;
  close: (name: string) => void;
  toggle: (name: string) => void;
  /** Close every open dialog (e.g. on Escape or route change). */
  closeAll: () => void;
}

export function useDialogs(): DialogsApi {
  const [open, dispatch] = useReducer(dialogsReducer, undefined, () => new Set<string>());

  const isOpen = useCallback((name: string) => open.has(name), [open]);
  const openFn = useCallback((name: string) => dispatch({ type: 'open', name }), []);
  const closeFn = useCallback((name: string) => dispatch({ type: 'close', name }), []);
  const toggle = useCallback((name: string) => dispatch({ type: 'toggle', name }), []);
  const closeAll = useCallback(() => dispatch({ type: 'closeAll' }), []);

  return useMemo(
    () => ({ isOpen, open: openFn, close: closeFn, toggle, closeAll }),
    [isOpen, openFn, closeFn, toggle, closeAll]
  );
}

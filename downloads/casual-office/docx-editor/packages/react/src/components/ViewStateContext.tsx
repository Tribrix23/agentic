/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { createContext, useContext } from 'react';

/**
 * ViewState — the view-toggle handlers + their current on/off state that
 * the editor chrome (TitleBar's View/Tools menus, FormattingBar's paint-
 * format button) reads.
 *
 * Why a dedicated context: these 7 toggle pairs (14 fields) were previously
 * threaded as individual props on the `<EditorToolbar>` call site in
 * DocxEditor (the god-component), inflating an already ~80-prop call. They
 * don't vary per sub-component and are only ever produced by DocxEditor, so
 * a single cohesive context both slims that call site and groups "is this
 * view feature on, and how do I toggle it" into one typed surface — the
 * same rationale as `DialogActionsContext` for the dialog-open handlers.
 *
 * Deliberately NOT folded into `ToolbarProps` / `EditorToolbarContext`:
 * `ToolbarProps` (and the `Toolbar` / `FormattingBar` components) are part
 * of the published `@casualoffice/docs` API — removing these flat props
 * from them would be a breaking change. This context is purely internal
 * wiring; the public prop contracts are untouched, and consumers still
 * honour an explicitly-passed prop first (falling back to the context only
 * when the prop is omitted) — same pattern as `DialogActionsContext`.
 *
 * Each field is optional: a `null` provider (or a missing key) simply means
 * "that feature is absent", which the consumers already presence-gate on
 * (e.g. the View menu itself only renders when at least one toggle exists).
 */
export interface ViewState {
  onPaintFormat?: () => void;
  paintFormatArmed?: boolean;
  onToggleShowRuler?: () => void;
  rulerVisible?: boolean;
  onToggleShowVerticalRuler?: () => void;
  verticalRulerVisible?: boolean;
  onToggleSpellcheck?: () => void;
  spellcheckEnabled?: boolean;
  onToggleGrammar?: () => void;
  grammarEnabled?: boolean;
  onToggleShowFormattingMarks?: () => void;
  showFormattingMarks?: boolean;
  onToggleOutline?: () => void;
  outlineVisible?: boolean;
}

const EMPTY: ViewState = {};

export const ViewStateContext = createContext<ViewState | null>(null);

/**
 * Read the view-toggle handlers + state. Returns a stable empty object when
 * no provider is present, so callers can read fields without null checks.
 */
export function useViewState(): ViewState {
  return useContext(ViewStateContext) ?? EMPTY;
}

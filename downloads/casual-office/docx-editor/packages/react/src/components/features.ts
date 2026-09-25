/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Feature-flag map for DocxEditor chrome (docs#272, doc 38 §5a).
 *
 * A flat `Record<string, boolean>` of control-id → enabled. `false` hides the
 * control; an omitted key defaults to enabled. This is the shared shape the
 * sister sheet SDK already uses (`CasualSheets.features`); the *keys* are
 * per-format (a doc's `ruler` control and a sheet's `merge` control are
 * legitimately different), so docs publishes its own catalog below.
 *
 * The coarse `show*` booleans (`showToolbar`, `showStatusBar`, …) stay as
 * deprecated shortcuts that write into this map — when both are supplied for
 * the same region, `features` wins.
 */

import { createContext } from 'react';
import { keymap } from 'prosemirror-keymap';
import type { Command, Plugin } from 'prosemirror-state';

/**
 * The published DocxEditor feature-id catalog. Split into coarse chrome regions
 * (each mirrors a deprecated `show*` boolean) and individual toolbar controls.
 * Hosts may pass ids outside this list; they are simply ignored, so the catalog
 * can grow without a breaking change.
 */
export const DOCX_FEATURE_IDS = [
  // ── Coarse chrome regions (deprecated show* booleans map to these) ──
  'toolbar',
  // The app-shell rows that sit above the formatting toolbar. Gated
  // independently of `toolbar` so an embedding host can hide the shell
  // (logo + document name + menus + About/Help) while keeping the
  // formatting toolbar (doc 39 — embedded-mode contract). `titleBar` is the
  // whole top row (logo/name/menus); `menuBar` is just the File/Edit/… menus
  // inside it, so a host can keep the title row but drop the menus.
  'titleBar',
  'menuBar',
  'panelRail',
  'statusBar',
  'zoomControl',
  'printButton',
  'outline',
  'ruler',
  // ── Individual toolbar controls (hidden via DisabledFeaturesContext) ──
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'paintFormat',
] as const;

/** A known DocxEditor feature id. Hosts may also pass arbitrary string keys. */
export type DocxFeatureId = (typeof DOCX_FEATURE_IDS)[number];

/** Per-control on/off map. Omitted keys default to enabled. */
export type FeatureMap = Record<string, boolean>;

/**
 * Resolve a feature's effective enabled state. An explicit `features[id]` wins;
 * otherwise the caller's `fallback` (e.g. the deprecated `show*` prop, or the
 * `chrome`-preset default) applies. Defaults to enabled when nothing is set.
 */
export function isFeatureEnabled(
  features: FeatureMap | undefined,
  id: string,
  fallback = true
): boolean {
  if (features && Object.prototype.hasOwnProperty.call(features, id)) {
    return features[id];
  }
  return fallback;
}

/**
 * Resolved visibility of the top chrome rows for a `chrome` preset + `features`
 * overrides (doc 39 — embedded-mode contract). The formatting toolbar and the
 * app shell (title bar + menu bar) are gated *independently*: the `"embedded"`
 * preset hides the shell by default while keeping the toolbar, so an embedding
 * host renders one shell (its own) plus the editor's formatting toolbar — not
 * the "two shells" that a shared `toolbar` gate produced. Centralized here so
 * the DocxEditor render gate and its unit tests share one source of truth.
 */
export interface ChromeVisibility {
  /** The formatting toolbar (bold/italic/font/…). Hidden only by `chrome:"none"`. */
  toolbar: boolean;
  /** The title row: logo + document name. Hidden by `chrome:"embedded"`. */
  titleBar: boolean;
  /**
   * The File/Edit/Insert/Format/… menus. Part of the editing surface, so they
   * stay in `chrome:"embedded"` and are hidden only by `chrome:"none"`. In
   * embedded the host-owned File/Help entries (Open/New/About/…) are pruned,
   * but every editing menu remains.
   */
  menuBar: boolean;
  /**
   * True when the title row (app shell) is gone — the host owns file
   * identity/lifecycle, so the SDK suppresses Cmd/Ctrl+O and Cmd/Ctrl+N and
   * prunes the host-owned File/Help menu entries.
   */
  appShellHidden: boolean;
}

/**
 * Resolve {@link ChromeVisibility} from the `chrome` preset and `features` map.
 * `showToolbarFallback` is the toolbar default the preset/`showToolbar` prop
 * already encoded. `features.titleBar` / `features.menuBar` override the shell
 * in any preset, so a host can also opt into the bare surface without the
 * preset (`features={{ titleBar: false, menuBar: false }}`).
 */
export function resolveChromeVisibility(
  chrome: string | undefined,
  features: FeatureMap | undefined,
  showToolbarFallback: boolean
): ChromeVisibility {
  const toolbar = isFeatureEnabled(features, 'toolbar', showToolbarFallback);
  // The formatting toolbar AND the editing menus (Insert/Format/Tools/View/…)
  // are the *editing surface* — both survive `"embedded"`; only `"none"` drops
  // them. The title *row* (logo + document name) is the app shell the host
  // replaces, so it alone defaults off in `"embedded"`. Keeping these welded
  // was the doc-39 regression: hiding the menu bar stranded ~50 menu-only
  // features (Insert image/table, Format paragraph, Tools word-count, …).
  const editingSurfaceDefault = chrome !== 'none';
  const appShellDefault = chrome !== 'embedded' && chrome !== 'none';
  const titleBar = isFeatureEnabled(features, 'titleBar', appShellDefault);
  const menuBar = isFeatureEnabled(features, 'menuBar', editingSurfaceDefault);
  // App shell == the title row. Whenever it's hidden the host owns file
  // identity/lifecycle, so the SDK suppresses Cmd/Ctrl+O·N and prunes the
  // host-owned File/Help menu entries even though the editing menus stay.
  return { toolbar, titleBar, menuBar, appShellHidden: !titleBar };
}

/** The set of feature ids explicitly disabled (`features[id] === false`). */
export function disabledFeatureSet(features: FeatureMap | undefined): ReadonlySet<string> {
  if (!features) return EMPTY_DISABLED_FEATURES;
  const set = new Set<string>();
  for (const [id, enabled] of Object.entries(features)) {
    if (enabled === false) set.add(id);
  }
  return set;
}

/** Shared empty set so consumers avoid churn when no features are disabled. */
export const EMPTY_DISABLED_FEATURES: ReadonlySet<string> = new Set<string>();

/**
 * Context carrying the set of explicitly-disabled feature ids down to the
 * toolbar. A `ToolbarButton` with a matching `featureId` renders `null`, so a
 * host hides an individual control by id without the toolbar knowing which
 * buttons exist. Default is the empty set (everything enabled).
 */
export const DisabledFeaturesContext = createContext<ReadonlySet<string>>(EMPTY_DISABLED_FEATURES);

/**
 * Feature ids that gate an editing *command*, not just a toolbar button. Each
 * entry lists the command-registry names (what `DocxEditorRef.executeCommand`
 * routes through) and the keyboard shortcut keys (what the PM keymap binds) the
 * feature owns. Disabling the feature must veto BOTH — otherwise hiding the
 * button still leaves Ctrl+B and `executeCommand('bold')` live (docs#289).
 *
 * Only features with a real command/keymap appear here; a UI-only feature such
 * as `paintFormat` (format painter lives entirely in React) has nothing to
 * veto and is intentionally absent.
 */
export const FEATURE_COMMAND_BINDINGS: Record<
  string,
  { readonly commands: readonly string[]; readonly keys: readonly string[] }
> = {
  bold: { commands: ['toggleBold'], keys: ['Mod-b'] },
  italic: { commands: ['toggleItalic'], keys: ['Mod-i'] },
  underline: { commands: ['toggleUnderline'], keys: ['Mod-u'] },
  strikethrough: { commands: ['toggleStrike'], keys: ['Mod-Shift-x'] },
};

/** Reverse index: command-registry name → the feature id that governs it. */
const COMMAND_TO_FEATURE: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [featureId, { commands }] of Object.entries(FEATURE_COMMAND_BINDINGS)) {
    for (const command of commands) map.set(command, featureId);
  }
  return map;
})();

/**
 * Whether a command should be vetoed because its feature is disabled. Accepts
 * either the feature id itself (`bold`) or a command-registry name
 * (`toggleBold`), so both `executeCommand('bold')` and the canonical
 * `executeCommand('toggleBold')` are covered.
 */
export function isCommandVetoed(
  disabled: ReadonlySet<string>,
  commandOrFeatureId: string
): boolean {
  if (disabled.size === 0) return false;
  if (disabled.has(commandOrFeatureId)) return true;
  const featureId = COMMAND_TO_FEATURE.get(commandOrFeatureId);
  return featureId != null && disabled.has(featureId);
}

/**
 * Build the key → veto-command map for {@link createFeatureVetoPlugin}. Each
 * binding returns `true` to consume the key as a no-op while its feature is
 * disabled, or `false` to fall through to the real formatting command when
 * enabled. Exposed for unit testing the veto contract without a live view.
 */
export function buildFeatureVetoBindings(
  getDisabled: () => ReadonlySet<string>
): Record<string, Command> {
  const bindings: Record<string, Command> = {};
  for (const [featureId, { keys }] of Object.entries(FEATURE_COMMAND_BINDINGS)) {
    const veto: Command = () => getDisabled().has(featureId);
    for (const key of keys) bindings[key] = veto;
  }
  return bindings;
}

/**
 * A ProseMirror keymap plugin that swallows a feature's keyboard shortcut while
 * that feature is disabled. Bindings read the live disabled set through
 * `getDisabled` (a ref-backed getter) so the plugin — and therefore the editor
 * state — stays stable across `features` prop changes.
 *
 * Placed ahead of the extension keymaps (external plugins run first), a vetoed
 * key is consumed before the real formatting command sees it.
 */
export function createFeatureVetoPlugin(getDisabled: () => ReadonlySet<string>): Plugin {
  return keymap(buildFeatureVetoBindings(getDisabled));
}

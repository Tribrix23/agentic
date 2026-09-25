/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Editor-extension API (docs#273, doc 38 §5–6).
 *
 * A SuperDoc-style way for a host to ADD or REPLACE ProseMirror behavior
 * without forking the editor. Each extension contributes raw ProseMirror
 * plugins, which the editor merges with its built-ins and the low-level
 * `externalPlugins` escape hatch. This is the higher-level, named surface;
 * `externalPlugins` stays as the raw plugin array for advanced/collab wiring
 * (e.g. `ySyncPlugin`), and both compose.
 */

import type { Plugin } from 'prosemirror-state';

/** Context handed to an extension's `plugins` factory. */
export interface EditorExtensionContext {
  /**
   * The plugin list assembled so far (built-ins + `externalPlugins` + any
   * earlier extensions). An extension can inspect, wrap, or reorder these to
   * layer behavior on top of what already exists.
   */
  plugins: readonly Plugin[];
}

/**
 * A host-supplied editor extension. Extensions are keyed by `name`: if two
 * extensions (or a host extension re-declaring a built-in name) share a name,
 * the **later one wins** — SuperDoc-style override without forking.
 */
export interface EditorExtension {
  /** Stable name. Duplicate names collapse to the last declaration. */
  name: string;
  /**
   * Raw ProseMirror plugins this extension contributes. Pass an array, or a
   * factory that receives the plugins assembled so far (for wrapping/reordering).
   * Omit to declare a no-op / placeholder extension.
   */
  plugins?: readonly Plugin[] | ((ctx: EditorExtensionContext) => readonly Plugin[]);
  /**
   * When true, this extension's plugins REPLACE the entire base plugin list
   * assembled so far instead of appending to it. Full control for advanced
   * hosts that want to own the plugin stack. Default: false (append).
   */
  replace?: boolean;
}

/**
 * Merge host `editorExtensions` onto a base plugin list. Names are de-duplicated
 * (last declaration wins); each surviving extension appends its plugins, or —
 * with `replace: true` — swaps the accumulated list wholesale. Returns a fresh
 * array; `base` is never mutated.
 */
export function resolveEditorExtensionPlugins(
  base: readonly Plugin[],
  extensions: readonly EditorExtension[] | undefined
): Plugin[] {
  if (!extensions || extensions.length === 0) return [...base];

  // De-dupe by name, preserving first-seen order but taking the last value.
  const byName = new Map<string, EditorExtension>();
  for (const ext of extensions) byName.set(ext.name, ext);

  let acc: Plugin[] = [...base];
  for (const ext of byName.values()) {
    const contributed =
      typeof ext.plugins === 'function' ? ext.plugins({ plugins: acc }) : (ext.plugins ?? []);
    acc = ext.replace ? [...contributed] : [...acc, ...contributed];
  }
  return acc;
}

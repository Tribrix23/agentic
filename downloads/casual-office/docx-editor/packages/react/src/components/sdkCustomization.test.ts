/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Unit tests for the SDK customization surface (docs#272 / docs#273):
 *  - `features` flag-map resolution + disabled-id set (feature hiding).
 *  - `editorExtensions` → merged ProseMirror plugin stack.
 * Both are framework-agnostic pure functions, so no editor render is needed.
 */
import { describe, expect, it } from 'bun:test';
import type { Plugin } from 'prosemirror-state';

import type { Command, EditorState } from 'prosemirror-state';

import {
  disabledFeatureSet,
  isFeatureEnabled,
  isCommandVetoed,
  buildFeatureVetoBindings,
  resolveChromeVisibility,
} from './features';
import { resolveEditorExtensionPlugins, type EditorExtension } from './editorExtensions';

// Lightweight stand-ins — resolveEditorExtensionPlugins only moves references.
const p = (id: string) => ({ id }) as unknown as Plugin;

describe('features flag-map (docs#272)', () => {
  it('an explicit false hides; true shows; omitted falls back', () => {
    const features = { toolbar: false, ruler: true };
    expect(isFeatureEnabled(features, 'toolbar', true)).toBe(false);
    expect(isFeatureEnabled(features, 'ruler', false)).toBe(true);
    // Omitted key → caller fallback (the deprecated show* prop / chrome default).
    expect(isFeatureEnabled(features, 'statusBar', true)).toBe(true);
    expect(isFeatureEnabled(features, 'statusBar', false)).toBe(false);
  });

  it('features win over the fallback for the same region', () => {
    // show* prop says visible, features says hidden → hidden.
    expect(isFeatureEnabled({ toolbar: false }, 'toolbar', true)).toBe(false);
  });

  it('defaults to enabled when no map is passed', () => {
    expect(isFeatureEnabled(undefined, 'bold')).toBe(true);
  });

  it('disabledFeatureSet collects only the explicitly-disabled ids', () => {
    const set = disabledFeatureSet({ bold: false, italic: true, underline: false });
    expect(set.has('bold')).toBe(true);
    expect(set.has('underline')).toBe(true);
    expect(set.has('italic')).toBe(false);
    expect(set.size).toBe(2);
  });

  it('an empty / missing map disables nothing', () => {
    expect(disabledFeatureSet(undefined).size).toBe(0);
    expect(disabledFeatureSet({}).size).toBe(0);
  });
});

describe('embedded chrome — editing surface without the app shell (doc 39)', () => {
  // Mirrors the `showToolbar` default the DocxEditor prop destructure encodes
  // (`chrome === 'none' ? false : true`) so the fallback matches the component.
  const toolbarFallback = (chrome: string | undefined) => chrome !== 'none';

  it('chrome:"embedded" keeps the formatting toolbar AND the editing menus, dropping only the title row', () => {
    const v = resolveChromeVisibility('embedded', undefined, toolbarFallback('embedded'));
    expect(v.toolbar).toBe(true); // formatting toolbar stays
    expect(v.titleBar).toBe(false); // logo + document-name row gone (host owns it)
    // The menu bar is the editing surface — Insert/Format/Tools/View/… must
    // stay reachable. (The host-owned File/Help entries are pruned inside the
    // component via appShellHidden; the bar itself stays.)
    expect(v.menuBar).toBe(true);
    expect(v.appShellHidden).toBe(true); // title row gone → host owns files → suppress Cmd+O/N
  });

  it('chrome:"full" (and default) keeps the whole shell', () => {
    for (const chrome of ['full', undefined] as const) {
      const v = resolveChromeVisibility(chrome, undefined, toolbarFallback(chrome));
      expect(v.toolbar).toBe(true);
      expect(v.titleBar).toBe(true);
      expect(v.menuBar).toBe(true);
      expect(v.appShellHidden).toBe(false);
    }
  });

  it('chrome:"minimal" keeps the shell (only "embedded" hides it)', () => {
    const v = resolveChromeVisibility('minimal', undefined, toolbarFallback('minimal'));
    expect(v.titleBar).toBe(true);
    expect(v.menuBar).toBe(true);
    expect(v.appShellHidden).toBe(false);
  });

  it('features={{ titleBar:false, menuBar:false }} hides the shell in any preset, toolbar stays', () => {
    const v = resolveChromeVisibility('full', { titleBar: false, menuBar: false }, true);
    expect(v.toolbar).toBe(true);
    expect(v.titleBar).toBe(false);
    expect(v.menuBar).toBe(false);
    expect(v.appShellHidden).toBe(true);
  });

  it('features can keep the title row but drop only the menus (title bar shown, appShell not "hidden")', () => {
    const v = resolveChromeVisibility('full', { menuBar: false }, true);
    expect(v.titleBar).toBe(true);
    expect(v.menuBar).toBe(false);
    // Title row still present → not the full embedded shell, so Cmd+O/N stay.
    expect(v.appShellHidden).toBe(false);
  });

  it('features override the embedded default — a host can force the shell back on', () => {
    const v = resolveChromeVisibility('embedded', { titleBar: true, menuBar: true }, true);
    expect(v.titleBar).toBe(true);
    expect(v.menuBar).toBe(true);
    expect(v.appShellHidden).toBe(false);
  });

  it('chrome:"none" also hides the toolbar (unchanged behavior)', () => {
    const v = resolveChromeVisibility('none', undefined, toolbarFallback('none'));
    expect(v.toolbar).toBe(false);
  });
});

describe('disabled features veto their command (docs#289)', () => {
  it('vetoes by feature id and by command name; enabled commands pass', () => {
    const disabled = disabledFeatureSet({ bold: false, italic: true });
    // Feature id form (executeCommand('bold')).
    expect(isCommandVetoed(disabled, 'bold')).toBe(true);
    // Command-registry name form (executeCommand('toggleBold')).
    expect(isCommandVetoed(disabled, 'toggleBold')).toBe(true);
    // An enabled feature is untouched, by either name.
    expect(isCommandVetoed(disabled, 'italic')).toBe(false);
    expect(isCommandVetoed(disabled, 'toggleItalic')).toBe(false);
    // Unknown ids are never vetoed.
    expect(isCommandVetoed(disabled, 'someOtherCommand')).toBe(false);
  });

  it('an empty disabled set vetoes nothing', () => {
    expect(isCommandVetoed(new Set(), 'bold')).toBe(false);
    expect(isCommandVetoed(new Set(), 'toggleBold')).toBe(false);
  });

  it('the keymap binding no-ops (returns true, never dispatches) when disabled, else falls through', () => {
    const disabled = new Set<string>(['bold']);
    const bindings = buildFeatureVetoBindings(() => disabled);
    const veto = bindings['Mod-b'] as Command;
    expect(veto).toBeDefined();

    // Disabled → command consumes the key as a no-op: returns true, no dispatch.
    let dispatched = false;
    const dispatch = () => {
      dispatched = true;
    };
    expect(veto({} as EditorState, dispatch)).toBe(true);
    expect(dispatched).toBe(false);

    // Enabled (feature removed from the live set) → falls through: returns false
    // so the real formatting command downstream runs.
    disabled.delete('bold');
    expect(veto({} as EditorState, dispatch)).toBe(false);
    expect(dispatched).toBe(false);
  });

  it('binds a key for every feature that owns a keyboard shortcut', () => {
    const bindings = buildFeatureVetoBindings(() => new Set());
    expect(Object.keys(bindings).sort()).toEqual(['Mod-Shift-x', 'Mod-b', 'Mod-i', 'Mod-u'].sort());
  });
});

describe('editorExtensions plugin merge (docs#273)', () => {
  const base = [p('base-a'), p('base-b')];

  it('returns a copy of the base when no extensions are given', () => {
    const out = resolveEditorExtensionPlugins(base, undefined);
    expect(out).toEqual(base);
    expect(out).not.toBe(base); // fresh array, base untouched
  });

  it("appends an extension's plugins after the base", () => {
    const ext: EditorExtension = { name: 'host', plugins: [p('host-1')] };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual([
      'base-a',
      'base-b',
      'host-1',
    ]);
  });

  it('a factory receives the plugins assembled so far', () => {
    const ext: EditorExtension = {
      name: 'wrap',
      plugins: (ctx) => [...ctx.plugins.slice(0, 1), p('wrapped')],
    };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual([
      'base-a',
      'base-b',
      'base-a',
      'wrapped',
    ]);
  });

  it('replace:true swaps the accumulated stack wholesale', () => {
    const ext: EditorExtension = { name: 'own', plugins: [p('only')], replace: true };
    const out = resolveEditorExtensionPlugins(base, [ext]);
    expect(out.map((x) => (x as unknown as { id: string }).id)).toEqual(['only']);
  });

  it('a later extension with the same name overrides the earlier one', () => {
    const first: EditorExtension = { name: 'dup', plugins: [p('first')] };
    const second: EditorExtension = { name: 'dup', plugins: [p('second')] };
    const out = resolveEditorExtensionPlugins(base, [first, second]);
    const ids = out.map((x) => (x as unknown as { id: string }).id);
    expect(ids).toContain('second');
    expect(ids).not.toContain('first');
  });
});

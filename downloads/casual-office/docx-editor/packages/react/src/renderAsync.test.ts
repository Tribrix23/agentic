/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Bun smoke tests for the renderAsync imperative handle. The real mount
 * needs a DOM + createRoot, which bun-test isn't the harness for; these
 * tests pin the handle's SDK contract at the type level so the vanilla
 * mount stays at parity with the React DocxEditorRef (doc 38 §4).
 */
import { describe, expect, it } from 'bun:test';

import type { DocxEditorHandle } from './renderAsync';

describe('renderAsync handle shape', () => {
  it('exposes the unified imperative surface (on/off/executeCommand/...)', () => {
    // Type-level check — if renderAsync ever stops surfacing these, this
    // file won't compile.
    const _expectShape = (h: DocxEditorHandle) => {
      // Pre-existing slim handle
      void h.save();
      h.focus();
      h.getDocument();
      h.setZoom(1.5);
      h.scrollToParaId('1A2B3C4D');
      h.scrollToPosition(42);
      h.destroy();
      // Unified imperative surface (doc 38 §4) — new on renderAsync.
      const off = h.on('change', () => {});
      off();
      h.off('dirtyChange', () => {});
      void h.executeCommand('toggleBold');
      const doc = h.getContent();
      if (doc) h.setContent(doc);
      h.undo();
      h.redo();
      h.setDocumentMode('viewing');
    };
    expect(typeof _expectShape).toBe('function');
  });
});

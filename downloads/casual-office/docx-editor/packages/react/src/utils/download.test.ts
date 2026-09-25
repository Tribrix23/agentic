/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from 'bun:test';
import { triggerBrowserDownload, documentBaseName, createDocxBlob, DOCX_MIME } from './download';

test('createDocxBlob wraps bytes with the OOXML docx MIME type', () => {
  const blob = createDocxBlob(new Uint8Array([0x50, 0x4b]));
  expect(blob.type).toBe(DOCX_MIME);
  expect(blob.size).toBe(2);
});

test('documentBaseName strips a trailing .docx, trims, and falls back', () => {
  expect(documentBaseName('Report.docx')).toBe('Report');
  expect(documentBaseName('  Report.DOCX  ')).toBe('Report');
  expect(documentBaseName('Notes')).toBe('Notes');
  expect(documentBaseName('')).toBe('Document'); // default fallback
  expect(documentBaseName(undefined)).toBe('Document');
  expect(documentBaseName('   ', 'document')).toBe('document'); // custom fallback
  // Only a trailing .docx is stripped, not a mid-name occurrence.
  expect(documentBaseName('my.docx.report.docx')).toBe('my.docx.report');
});

// Cast to a loose shape so the test can swap in DOM/URL/timer stubs without
// fighting the full lib.dom overloads — this is test-only scaffolding.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

test('triggerBrowserDownload wires a hidden anchor and defers the URL revoke', () => {
  const created: string[] = [];
  const anchor = {
    href: '',
    download: '',
    clicked: false,
    click() {
      this.clicked = true;
    },
  };
  // Held on an object so TS doesn't flow-narrow these to their initial null
  // (the assignments happen inside the stub callbacks below).
  const captured: { revoked: string | null; deferred: (() => void) | null } = {
    revoked: null,
    deferred: null,
  };

  const orig = { window: g.window, URL: g.URL, setTimeout: g.setTimeout };

  g.window = { document: { createElement: (t: string) => (created.push(t), anchor) } };
  g.URL = {
    createObjectURL: () => 'blob:stub-url',
    revokeObjectURL: (u: string) => {
      captured.revoked = u;
    },
  };
  g.setTimeout = (fn: () => void) => {
    captured.deferred = fn;
    return 0;
  };

  try {
    triggerBrowserDownload(new Blob(['x']), 'Report.docx');
    expect(created).toEqual(['a']);
    expect(anchor.href).toBe('blob:stub-url');
    expect(anchor.download).toBe('Report.docx');
    expect(anchor.clicked).toBe(true);
    // Revoke is deferred a tick (Safari cancels a sync revoke), not immediate.
    expect(captured.revoked).toBeNull();
    captured.deferred?.();
    expect(captured.revoked).toBe('blob:stub-url');
  } finally {
    g.window = orig.window;
    g.URL = orig.URL;
    g.setTimeout = orig.setTimeout;
  }
});

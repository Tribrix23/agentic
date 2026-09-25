/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Block-level SDT (content control) `alias` / `tag` must be XML-escaped on
 * serialize. Interpolating them raw produced malformed document.xml (e.g. a
 * control titled `Terms & Conditions` → `w:val="Terms & Conditions"`), which
 * Microsoft Word rejects as corrupt. The inline-SDT path already escaped;
 * this guards the block path.
 */

import { describe, expect, test } from 'bun:test';
import { serializeDocumentBody } from './documentSerializer';
import type { DocumentBody } from '../../types/content';

function bodyWithBlockSdt(alias: string, tag: string): DocumentBody {
  return {
    content: [
      {
        type: 'blockSdt',
        properties: { alias, tag },
        content: [],
      },
    ],
  } as unknown as DocumentBody;
}

describe('block SDT alias/tag XML escaping', () => {
  test('special characters in alias/tag are escaped, not emitted raw', () => {
    const xml = serializeDocumentBody(bodyWithBlockSdt('Terms & Conditions <x>', 'a"b'));

    expect(xml).toContain('<w:alias w:val="Terms &amp; Conditions &lt;x&gt;"/>');
    expect(xml).toContain('<w:tag w:val="a&quot;b"/>');
    // The raw, unescaped ampersand/angle bracket must never reach the XML.
    expect(xml).not.toContain('Terms & Conditions <x>');
  });

  test('plain alias/tag round-trip unchanged', () => {
    const xml = serializeDocumentBody(bodyWithBlockSdt('Summary', 'sum1'));
    expect(xml).toContain('<w:alias w:val="Summary"/>');
    expect(xml).toContain('<w:tag w:val="sum1"/>');
  });
});

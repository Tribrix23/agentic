/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { retrieve, tokenize } from './bm25';
import type { RetrievalChunk } from './types';

const chunks: RetrievalChunk[] = [
  {
    id: 'c1',
    text: 'The introduction explains the project goals and scope.',
    meta: { blockIds: ['b1'] },
  },
  {
    id: 'c2',
    text: 'Revenue grew 40% in Q3 driven by the new pricing model.',
    meta: { blockIds: ['b2'] },
  },
  {
    id: 'c3',
    text: 'The conclusion summarizes findings and proposes next steps.',
    meta: { blockIds: ['b3'] },
  },
  {
    id: 'c4',
    text: 'Our pricing strategy uses tiered subscription revenue tiers.',
    meta: { blockIds: ['b4'] },
  },
];

describe('tokenize', () => {
  it('lowercases, splits, and drops stopwords + 1-char tokens', () => {
    expect(tokenize('The Revenue, in Q3!')).toEqual(['revenue', 'q3']);
  });
});

describe('retrieve (BM25)', () => {
  it('ranks the on-topic chunks first', () => {
    const res = retrieve(chunks, 'how did pricing affect revenue', { k: 2 });
    const ids = res.chunks.map((c) => c.id);
    // c2 and c4 both mention pricing + revenue; they should outrank intro/conclusion.
    expect(ids).toContain('c2');
    expect(ids).toContain('c4');
    expect(ids).not.toContain('c1');
  });

  it('carries locator metadata through for edit targeting', () => {
    const res = retrieve(chunks, 'conclusion next steps', { k: 1 });
    expect(res.chunks[0].id).toBe('c3');
    expect((res.chunks[0].meta as { blockIds: string[] }).blockIds).toEqual(['b3']);
  });

  it('drops zero-score chunks (no lexical overlap)', () => {
    const res = retrieve(chunks, 'quarterly revenue', { k: 5 });
    // Only the revenue chunks overlap; intro/conclusion score 0 and are dropped.
    expect(res.chunks.every((c) => c.score > 0)).toBe(true);
    expect(res.chunks.length).toBeLessThan(chunks.length);
  });

  it('respects the character budget and flags truncation', () => {
    // The top match ("Revenue grew 40% …", 55 chars) fits in 58; the next
    // (60 chars) does not, so exactly one is returned and truncated is set.
    const res = retrieve(chunks, 'pricing revenue', { k: 5, charBudget: 58 });
    expect(res.chunks.length).toBe(1);
    expect(res.truncated).toBe(true);
  });

  it('returns empty (not a crash) when nothing matches', () => {
    const res = retrieve(chunks, 'xylophone spacecraft', {});
    expect(res.chunks).toHaveLength(0);
  });
});

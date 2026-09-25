/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { WorkspaceIndex } from './workspace';

function seeded(): WorkspaceIndex {
  const idx = new WorkspaceIndex();
  idx.add({
    id: '/docs/q3.docx',
    name: 'Q3 Report.docx',
    text: 'Revenue grew 40% in Q3 driven by the new pricing model and strong enterprise sales.',
  });
  idx.add({
    id: '/docs/roadmap.docx',
    name: 'Roadmap.docx',
    text: 'The 2026 roadmap prioritizes the offline AI assistant and local model support.',
  });
  idx.add({
    id: '/docs/hr.docx',
    name: 'HR Policy.docx',
    text: 'Employees accrue paid time off monthly and may carry over up to ten days.',
  });
  return idx;
}

describe('WorkspaceIndex', () => {
  it('retrieves across documents and attributes each hit to its source', () => {
    const res = seeded().search('how did revenue and pricing perform', 3);
    expect(res.hits[0].docName).toBe('Q3 Report.docx');
    expect(res.hits[0].snippet).toContain('Revenue');
    // Every hit carries a citation.
    expect(res.hits.every((h) => h.docId && h.docName)).toBe(true);
  });

  it('lists distinct sources for a citation list', () => {
    const idx = new WorkspaceIndex();
    idx.add({ id: 'a', name: 'A', text: 'pricing revenue pricing' });
    idx.add({ id: 'b', name: 'B', text: 'pricing strategy tiers' });
    const res = idx.search('pricing', 6);
    expect(res.sources.map((s) => s.docId).sort()).toEqual(['a', 'b']);
  });

  it('does not match unrelated documents', () => {
    const res = seeded().search('paid time off carryover', 6);
    // Only the HR doc should surface.
    expect(res.hits.every((h) => h.docName === 'HR Policy.docx')).toBe(true);
  });

  it('add() replaces an existing document (no stale chunks)', () => {
    const idx = new WorkspaceIndex();
    idx.add({ id: 'x', name: 'X', text: 'alpha bravo charlie' });
    idx.add({ id: 'x', name: 'X', text: 'delta echo foxtrot' });
    expect(idx.size).toBe(1);
    expect(idx.search('alpha', 6).hits).toHaveLength(0);
    expect(idx.search('delta', 6).hits).toHaveLength(1);
  });

  it('remove() drops a document from results', () => {
    const idx = seeded();
    idx.remove('/docs/q3.docx');
    expect(idx.size).toBe(2);
    expect(idx.search('revenue pricing', 6).hits).toHaveLength(0);
  });
});

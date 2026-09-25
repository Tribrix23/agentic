/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { rewriteFragmentWith } from './rewriteFragment';

// Minimal schema mirroring the shapes the real editor sends through the
// rewrite walk: block nodes (paragraph, heading, a table-ish container) and
// inline marks (bold). We only need structure, not the full OOXML schema.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    table: { group: 'block', content: 'block+', toDOM: () => ['table', 0] },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
  },
});

const bold = schema.marks.bold.create();

// Uppercasing "generator" — stands in for the model. Deterministic so we can
// assert both that text changed and that structure/marks were preserved.
const upper = async (text: string) => text.toUpperCase();

describe('rewriteFragmentWith', () => {
  it('preserves heading level and paragraph structure', async () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 2 }, [schema.text('title')]),
      schema.node('paragraph', null, [schema.text('body text')]),
    ]);

    const out = await rewriteFragmentWith(doc.content, schema, upper);

    expect(out.childCount).toBe(2);
    expect(out.child(0).type.name).toBe('heading');
    expect(out.child(0).attrs.level).toBe(2);
    expect(out.child(0).textContent).toBe('TITLE');
    expect(out.child(1).type.name).toBe('paragraph');
    expect(out.child(1).textContent).toBe('BODY TEXT');
  });

  it('keeps bold marks on the runs that had them', async () => {
    const para = schema.node('paragraph', null, [
      schema.text('plain '),
      schema.text('strong', [bold]),
    ]);
    const doc = schema.node('doc', null, [para]);

    const out = await rewriteFragmentWith(doc.content, schema, upper);
    const p = out.child(0);

    // Two runs, marks intact, text transformed. (The walker trims each leaf,
    // so the trailing space on the first run is dropped — pre-existing
    // behavior shared with the web rewrite path.)
    expect(p.child(0).text).toBe('PLAIN');
    expect(p.child(0).marks.length).toBe(0);
    expect(p.child(1).text).toBe('STRONG');
    expect(p.child(1).marks.some((m) => m.type.name === 'bold')).toBe(true);
  });

  it('recurses into nested block containers (tables) without flattening them', async () => {
    const doc = schema.node('doc', null, [
      schema.node('table', null, [schema.node('paragraph', null, [schema.text('cell')])]),
    ]);

    const out = await rewriteFragmentWith(doc.content, schema, upper);

    expect(out.child(0).type.name).toBe('table');
    expect(out.child(0).child(0).type.name).toBe('paragraph');
    expect(out.child(0).child(0).textContent).toBe('CELL');
  });

  it('does not collapse a multi-block selection into one paragraph', async () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [schema.text('h')]),
      schema.node('paragraph', null, [schema.text('a')]),
      schema.node('paragraph', null, [schema.text('b')]),
    ]);

    const out = await rewriteFragmentWith(doc.content, schema, upper);

    expect(out.childCount).toBe(3);
    expect(out.child(0).type.name).toBe('heading');
  });
});

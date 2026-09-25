/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * paraIdsSafeToClear guards the selective-save data-loss window: a paragraph
 * re-edited while the async serialize is in flight must NOT have its tracker
 * entry cleared, or the re-edit is silently dropped (it wasn't in the saved
 * bytes and a selective save only re-serializes still-tracked paragraphs).
 */

import { describe, test, expect } from 'bun:test';
import { Schema } from 'prosemirror-model';
import { paraIdsSafeToClear } from './ParagraphChangeTrackerExtension';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { paraId: { default: null } },
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
});

function doc(...paras: Array<{ text: string; paraId: string }>) {
  return schema.node(
    'doc',
    null,
    paras.map((p) =>
      schema.node('paragraph', { paraId: p.paraId }, p.text ? [schema.text(p.text)] : [])
    )
  );
}

describe('paraIdsSafeToClear', () => {
  test('a paragraph re-edited during the window is retained (not cleared)', () => {
    const served = doc({ text: 'hello', paraId: 'a' }, { text: 'world', paraId: 'b' });
    // 'a' got more text while serialize was in flight; 'b' is untouched.
    const current = doc({ text: 'hello!!', paraId: 'a' }, { text: 'world', paraId: 'b' });

    const safe = paraIdsSafeToClear(served, current, new Set(['a', 'b']));
    expect(safe.has('a')).toBe(false); // re-edited → keep tracked
    expect(safe.has('b')).toBe(true); // unchanged → safe to clear
  });

  test('the same doc reference short-circuits to the whole set', () => {
    const served = doc({ text: 'x', paraId: 'a' });
    const safe = paraIdsSafeToClear(served, served, new Set(['a']));
    expect([...safe]).toEqual(['a']);
  });

  test('a paragraph unchanged in content is safe to clear even if the doc changed elsewhere', () => {
    const served = doc({ text: 'keep', paraId: 'a' }, { text: 'edit', paraId: 'b' });
    const current = doc({ text: 'keep', paraId: 'a' }, { text: 'edited', paraId: 'b' });
    const safe = paraIdsSafeToClear(served, current, new Set(['a']));
    expect(safe.has('a')).toBe(true);
  });

  test('a paragraph deleted during the window is safe to clear (its change is moot)', () => {
    const served = doc({ text: 'gone', paraId: 'a' }, { text: 'stay', paraId: 'b' });
    const current = doc({ text: 'stay', paraId: 'b' });
    const safe = paraIdsSafeToClear(served, current, new Set(['a']));
    expect(safe.has('a')).toBe(true);
  });

  test('a mark-only re-edit (bold) is detected and retained', () => {
    const boldSchema = new Schema({
      nodes: schema.spec.nodes,
      marks: { bold: { toDOM: () => ['strong', 0] } },
    });
    const mk = (bold: boolean) =>
      boldSchema.node('doc', null, [
        boldSchema.node('paragraph', { paraId: 'a' }, [
          boldSchema.text('hi', bold ? [boldSchema.mark('bold')] : []),
        ]),
      ]);
    const safe = paraIdsSafeToClear(mk(false), mk(true), new Set(['a']));
    expect(safe.has('a')).toBe(false);
  });
});

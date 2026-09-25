/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from 'bun:test';
import { dialogsReducer } from './useDialogs';

const empty = new Set<string>();

test('open adds a dialog; open of an already-open dialog is a no-op (same ref)', () => {
  const a = dialogsReducer(empty, { type: 'open', name: 'about' });
  expect(a.has('about')).toBe(true);
  const b = dialogsReducer(a, { type: 'open', name: 'about' });
  expect(b).toBe(a); // identity preserved so React can bail out
});

test('close removes a dialog; close of a closed dialog is a no-op (same ref)', () => {
  const open = new Set(['about', 'wordCount']);
  const a = dialogsReducer(open, { type: 'close', name: 'about' });
  expect(a.has('about')).toBe(false);
  expect(a.has('wordCount')).toBe(true);
  const b = dialogsReducer(a, { type: 'close', name: 'about' });
  expect(b).toBe(a);
});

test('toggle flips membership', () => {
  const a = dialogsReducer(empty, { type: 'toggle', name: 'x' });
  expect(a.has('x')).toBe(true);
  const b = dialogsReducer(a, { type: 'toggle', name: 'x' });
  expect(b.has('x')).toBe(false);
});

test('closeAll clears; closeAll on empty is a no-op (same ref)', () => {
  const open = new Set(['a', 'b', 'c']);
  const cleared = dialogsReducer(open, { type: 'closeAll' });
  expect(cleared.size).toBe(0);
  expect(dialogsReducer(empty, { type: 'closeAll' })).toBe(empty);
});

test('dialogs are independent', () => {
  let s: ReadonlySet<string> = empty;
  s = dialogsReducer(s, { type: 'open', name: 'a' });
  s = dialogsReducer(s, { type: 'open', name: 'b' });
  expect(s.has('a')).toBe(true);
  expect(s.has('b')).toBe(true);
  s = dialogsReducer(s, { type: 'close', name: 'a' });
  expect(s.has('a')).toBe(false);
  expect(s.has('b')).toBe(true);
});

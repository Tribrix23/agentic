/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Kinsoku shori (禁則処理, OOXML §17.3.1.16): a line must not START with
// closing punctuation/brackets (。」』、) or END with an opening bracket
// (「『（). CJK text has no spaces, so line-breaking previously fell
// through to a raw per-character width fit with no awareness of this —
// every CJK-heavy real-world document violated it on multiple lines.
const LINE_START_FORBIDDEN = new Set([
  '）',
  ')',
  '］',
  ']',
  '｝',
  '}',
  '〉',
  '》',
  '「',
  '」',
  '『',
  '』',
  '【',
  '】',
  '〔',
  '〕',
  '〈',
  '’',
  '”',
  'ぁ',
  'ぃ',
  'ぅ',
  'ぇ',
  'ぉ',
  'っ',
  'ゃ',
  'ゅ',
  'ょ',
  'ゎ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
  'ッ',
  'ャ',
  'ュ',
  'ョ',
  'ヮ',
  'ー',
  'ゝ',
  'ゞ',
  'ヽ',
  'ヾ',
  '々',
  '、',
  '。',
  '，',
  '．',
  '・',
  '：',
  '；',
  '！',
  '？',
  '!',
  '?',
  ',',
  '.',
  '‐',
  '–',
  '～',
]);

test('sds-anti-t-zh.docx: no rendered line starts with a kinsoku-forbidden character', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/sds-anti-t-zh.docx');
  await page.waitForTimeout(2000);

  const pageEls = page.locator('.paged-editor__pages > *');
  const count = await pageEls.count();
  expect(count).toBeGreaterThan(0);

  const violations: string[] = [];
  for (let i = 0; i < count; i++) {
    await pageEls.nth(i).scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    const bad = await pageEls.nth(i).evaluate((pageEl, forbidden) => {
      const set = new Set(forbidden);
      const lineEls = Array.from(pageEl.querySelectorAll('.layout-line'));
      const out: string[] = [];
      for (const el of lineEls) {
        const text = (el.textContent ?? '').trim();
        if (text && set.has(text[0])) out.push(text.slice(0, 20));
      }
      return out;
    }, Array.from(LINE_START_FORBIDDEN));
    for (const b of bad) violations.push(`page ${i + 1}: "${b}"`);
  }

  expect(violations, `lines starting with a forbidden character:\n${violations.join('\n')}`).toEqual(
    []
  );
});

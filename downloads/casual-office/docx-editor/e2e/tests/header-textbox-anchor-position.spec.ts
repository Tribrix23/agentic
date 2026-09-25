/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Regression: `TextBoxBlock.anchor.offsetH/offsetV` are pixels (converted once
// from EMU in toProseDoc.ts) by the time they reach the renderer, but the
// header/footer and body-flow anchored-textbox painters ran them through
// emuToPixels() a second time — collapsing any real offset toward 0 (e.g. 93px
// treated as 93 EMU ≈ 0.01px). Every page-anchored text box in a header ended
// up at (roughly) the same position regardless of its declared offset, so
// multi-shape headers rendered as overlapping garbled text. This fixture's
// header has two page-anchored VML text boxes at different declared
// positions — they must land at visibly different, non-overlapping spots.
test('page-anchored header text boxes land at distinct positions, not collapsed together', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 1200 });
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/sds-anti-t-zh.docx');
  await page.waitForTimeout(1500);

  const tops = await page.evaluate(() => {
    const firstPage = document.querySelector('.paged-editor__pages > *');
    const boxes = Array.from(firstPage?.querySelectorAll('.layout-page-header .layout-textbox') ?? []);
    return boxes
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => r.top);
  });
  expect(tops.length).toBeGreaterThanOrEqual(2);

  // Before the fix, every anchored box collapsed to (approximately) the same
  // Y position. At least two boxes must differ by a visually meaningful
  // amount (the real fixture's declared offsets are tens of pixels apart).
  const spread = Math.max(...tops) - Math.min(...tops);
  expect(spread).toBeGreaterThan(20);
});

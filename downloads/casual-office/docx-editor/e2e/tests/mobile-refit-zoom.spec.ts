/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Fit-to-width zoom must re-apply when the viewport changes size, not only on
 * first mount. Previously `initialZoom` seeded the editor once and a later
 * resize/rotation never reached the live zoom, so on a phone the page could
 * overflow the viewport and clip off the right edge.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('page re-fits to width when the viewport shrinks to a phone', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);

  // Start wide so the auto-fit zoom seeds at 1.0, then add enough text to
  // make horizontal overflow observable.
  await page.setViewportSize({ width: 1280, height: 800 });
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('The quick brown fox jumps over the lazy dog. '.repeat(6));
  await page.waitForTimeout(400);

  const getZoom = () =>
    page.evaluate(
      () => (window as unknown as { __editorRef?: { current?: { getZoom(): number } } }).__editorRef?.current?.getZoom() ?? 1
    );
  expect(await getZoom()).toBeCloseTo(1, 1);

  // Shrink to a phone width — the effect must re-apply fit-to-width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);

  expect(await getZoom()).toBeLessThan(1);
  const overflow = await page.evaluate(
    () => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(2);
});

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Regression: the spellcheck squiggle (a DecorationLayer overlay div, not
// part of the normal text flow) stayed at its old screen position when the
// canvas shifted without a PM transaction — e.g. the Format panel opening
// shrinks/shifts the pages column (see selection-overlay-panel-shift.spec.ts
// for the same reflow mechanism), but DecorationLayer only resynced on
// {zoom, transactionVersion, renderEpoch}, none of which change on a pure
// viewport reflow. The squiggle visibly detached from its word.
const PANEL = '[data-testid="properties-panel"]';
const IMG_CHIP = '[data-testid="image-format-chip"]';
const INLINE_IMG = '[data-testid="docx-editor"] img.layout-run-image';

test('spellcheck squiggle follows the canvas when the Format panel opens', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/example-with-image.docx');
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('menuitem', { name: /Spell check/i }).click();
  await expect(page.getByText(/Loading spell-check/i)).toHaveCount(0, {
    timeout: 15_000,
  });

  await editor.focus();
  await editor.typeText(' Zxqvw ');

  const squiggle = page.locator('.spellcheck-error').first();
  await expect(squiggle).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(300);

  const img = page.locator(INLINE_IMG).first();
  const imgBoxBefore = await img.boundingBox();
  const squiggleBefore = await squiggle.boundingBox();
  expect(imgBoxBefore).not.toBeNull();
  expect(squiggleBefore).not.toBeNull();

  // Open the Format panel — a flex sibling that shrinks/shifts the page
  // column WITHOUT a PM transaction (the exact reflow-without-transaction
  // case this bug needs).
  await img.click({
    position: { x: Math.round(imgBoxBefore!.width / 2), y: Math.round(imgBoxBefore!.height / 2) },
  });
  await page.waitForTimeout(300);
  await page.locator(IMG_CHIP).click();
  await expect(page.locator(PANEL)).toBeVisible();
  await page.waitForTimeout(500); // allow reflow + ResizeObserver re-anchor

  const imgBoxAfter = await img.boundingBox();
  const squiggleAfter = await squiggle.boundingBox();
  expect(imgBoxAfter).not.toBeNull();
  expect(squiggleAfter).not.toBeNull();

  const canvasShift = imgBoxBefore!.x - imgBoxAfter!.x;
  const squiggleShift = squiggleBefore!.x - squiggleAfter!.x;

  // The panel must have actually shifted the canvas — otherwise this test
  // proves nothing.
  expect(canvasShift).toBeGreaterThan(20);

  // The squiggle must have shifted by (roughly) the same amount as the
  // canvas — before the fix it stayed put (squiggleShift ≈ 0) while the
  // canvas moved out from under it.
  expect(Math.abs(squiggleShift - canvasShift)).toBeLessThan(10);
});

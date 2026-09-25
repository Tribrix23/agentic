/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Find should search as you type — no Enter required — and its "No results"
 * status must always reflect the current query. Previously typing didn't
 * trigger a search until Enter, so the status line could show a stale
 * "No results found" for text that actually matches.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const OVERLAY = '.paged-editor__decoration-overlay';
const FIND = '[data-testid="find-input"]';
const NO_RESULTS = 'No results found';

test('find searches as you type, and "No results" tracks the current query', async ({ page }) => {
  test.setTimeout(60000);
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await ed.focus();
  await ed.typeText('apple banana apple cherry apple');
  await page.waitForTimeout(200);

  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+f`);
  await page.locator('[data-testid="find-replace-dialog"]').waitFor({ timeout: 3000 });

  // Type WITHOUT pressing Enter — the debounced search runs and highlights.
  await page.locator(FIND).fill('apple');
  await page.waitForTimeout(500);
  expect(await page.locator(`${OVERLAY} .find-match`).count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText(NO_RESULTS)).toHaveCount(0);

  // A genuinely-absent query shows "No results" (freshly, not stale).
  await page.locator(FIND).fill('zzzznope');
  await page.waitForTimeout(500);
  await expect(page.getByText(NO_RESULTS)).toBeVisible();

  // Back to a matching query — results return, the stale "No results" is gone.
  await page.locator(FIND).fill('banana');
  await page.waitForTimeout(500);
  await expect(page.getByText(NO_RESULTS)).toHaveCount(0);
  expect(await page.locator(`${OVERLAY} .find-match`).count()).toBeGreaterThanOrEqual(1);
});

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * The numbered vertical (left-margin) ruler is clutter that Google Docs
 * doesn't show — it's now OFF by default while the horizontal ruler stays on.
 * A "Vertical ruler" toggle under View brings it back for those who want it.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.use({ viewport: { width: 1440, height: 900 } });

test('vertical ruler is off by default and toggles from the View menu', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await page.waitForTimeout(300);

  // Horizontal ruler present, vertical ruler absent by default.
  await expect(page.locator('.docx-vertical-ruler')).toHaveCount(0);

  // Enable it via View > Vertical ruler.
  await page.getByTestId('title-bar').getByRole('button', { name: 'View', exact: true }).click();
  const item = page.getByRole('menuitem', { name: /Vertical ruler/i }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator('.docx-vertical-ruler')).toHaveCount(1);

  // Disable it again.
  await page.getByTestId('title-bar').getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: /Vertical ruler/i }).first().click();
  await expect(page.locator('.docx-vertical-ruler')).toHaveCount(0);
});

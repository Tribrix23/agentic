/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * In a menu where only some rows carry an icon (e.g. Insert), every label
 * must start at the same left edge. Previously an iconless row's label
 * collapsed left into the vacated icon slot, giving a ragged edge. The
 * MenuDropdown now reserves a fixed icon gutter for all rows once the menu
 * has at least one icon.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('menu labels align even when some rows have no icon', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();

  await page.getByTestId('title-bar').getByRole('button', { name: 'Insert' }).click();

  // "Image" has an icon; "Watermark…" does not. Their label spans must share
  // a left edge now that the gutter is reserved for both.
  const labelLeft = (name: string) =>
    page.getByRole('menuitem', { name }).locator('span', { hasText: name }).first().boundingBox();

  const withIcon = await labelLeft('Image');
  const withoutIcon = await labelLeft('Watermark');
  expect(withIcon).not.toBeNull();
  expect(withoutIcon).not.toBeNull();
  expect(Math.abs(withIcon!.x - withoutIcon!.x)).toBeLessThanOrEqual(1);
});

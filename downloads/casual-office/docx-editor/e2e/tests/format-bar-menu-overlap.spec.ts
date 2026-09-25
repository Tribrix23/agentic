/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * The floating selection format bar and an open menu-bar dropdown must not
 * show at the same time — a menu (e.g. Insert -> Table's grid picker) opened
 * over a live selection used to overlap the B/I/U bar. Opening any menu now
 * suppresses the format bar; closing it restores the bar.
 */

import { test, expect } from '@playwright/test';
import { modifierKey } from '../helpers/keyboard';

test('opening a menu hides the selection format bar; closing restores it', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.waitForSelector('[data-testid="docx-editor"]');
  await page.waitForTimeout(500);

  const bar = page.locator('[data-testid="desktop-format-bar"]');
  const formatMenu = page.getByTestId('title-bar').getByRole('button', { name: 'Format' });

  await page.locator('.ProseMirror').focus();
  await page.keyboard.type('Overlapping floating UI test');
  await page.keyboard.press(`${await modifierKey(page)}+a`);
  await expect(bar).toBeVisible({ timeout: 2000 });

  // Open a menu — the format bar must disappear while it's open.
  await formatMenu.click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await expect(bar).toHaveCount(0);

  // Close the menu and re-select — the bar comes back (suppression released).
  await page.keyboard.press('Escape');
  await page.locator('.ProseMirror').focus();
  await page.keyboard.press(`${await modifierKey(page)}+a`);
  await expect(bar).toBeVisible({ timeout: 2000 });
});

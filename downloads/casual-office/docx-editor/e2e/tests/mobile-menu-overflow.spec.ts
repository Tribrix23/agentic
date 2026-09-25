/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * At phone widths the seven-across menu bar (File/Edit/…/Help) truncated with
 * Insert/Tools/Help unreachable. Below 720px it now collapses into a single
 * hamburger whose items re-expose each menu as a submenu; on desktop the
 * seven menus render inline as before.
 */

import { test, expect } from '@playwright/test';

test.describe('menu bar responsive overflow', () => {
  test.describe('phone viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('collapses to a hamburger and every menu stays reachable', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(400);

      const titleBar = page.getByTestId('title-bar');
      // The inline top-level menu buttons are gone at this width…
      await expect(titleBar.getByRole('button', { name: 'Format', exact: true })).toHaveCount(0);
      // …replaced by the hamburger.
      await expect(page.getByTestId('menu-overflow')).toBeVisible();

      // Open it: all seven menus appear as rows, including the ones that used
      // to be off-screen (Insert/Tools/Help).
      await page.getByRole('button', { name: 'Menus' }).click();
      for (const name of ['File', 'Edit', 'Format', 'View', 'Insert', 'Tools', 'Help']) {
        await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
      }

      // Hovering a menu row opens its submenu with the real items.
      await page.getByRole('menuitem', { name: 'Insert', exact: true }).hover();
      await expect(page.getByRole('menuitem', { name: 'Image', exact: true })).toBeVisible();
    });
  });

  test.describe('desktop viewport', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('renders the seven menus inline, no hamburger', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(400);
      await expect(page.getByTestId('menu-overflow')).toHaveCount(0);
      const titleBar = page.getByTestId('title-bar');
      await expect(titleBar.getByRole('button', { name: 'Format', exact: true })).toBeVisible();
      await expect(titleBar.getByRole('button', { name: 'Insert', exact: true })).toBeVisible();
    });
  });
});

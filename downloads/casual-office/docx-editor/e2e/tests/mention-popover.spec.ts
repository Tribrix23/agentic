/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * @-mention popover — typing @word in the document body shows a name list;
 * picks insert "@Name ", Escape dismisses.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.describe('@-mention popover', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('shows popover when typing @<query> matching a known author', async ({ page }) => {
    await editor.typeText('@alex');
    // The popover should appear (it renders fixed in the document body root)
    const popover = page.locator('[style*="position: fixed"][style*="z-index: 2000"]').first();
    await expect(popover).toBeVisible({ timeout: 3000 });
    // "Alex Morgan" should be in the list
    await expect(popover).toContainText('Alex Morgan');
  });

  test('Escape dismisses the popover', async ({ page }) => {
    await editor.typeText('@alex');
    const popover = page.locator('[style*="position: fixed"][style*="z-index: 2000"]').first();
    await expect(popover).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden({ timeout: 2000 });
  });

  test('clicking a suggestion inserts @Name and closes popover', async ({ page }) => {
    await editor.typeText('@alex');
    const popover = page.locator('[style*="position: fixed"][style*="z-index: 2000"]').first();
    await expect(popover).toBeVisible({ timeout: 3000 });
    // Click "Alex Morgan"
    await popover.locator('text=Alex Morgan').click();
    // Popover closed
    await expect(popover).toBeHidden({ timeout: 2000 });
    // Text inserted — the document visible text should contain "@Alex Morgan"
    await expect(page.locator('.paged-editor__pages')).toContainText('@Alex Morgan');
  });

  test('popover hides after @query is deleted back to before the @', async ({ page }) => {
    await editor.typeText('@al');
    const popover = page.locator('[style*="position: fixed"][style*="z-index: 2000"]').first();
    await expect(popover).toBeVisible({ timeout: 3000 });
    // Delete all 3 chars: 'a', 'l', '@'
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(popover).toBeHidden({ timeout: 2000 });
  });
});

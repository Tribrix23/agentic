/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Formatting-bar shortcut hints are platform-correct. The bar used to hardcode
 * ⌘ glyphs, so Windows/Linux users saw Mac shortcuts. The hints now route
 * through formatShortcut(), so a non-Mac platform sees "Ctrl+…".
 */

import { test, expect } from '@playwright/test';

test.describe('Formatting bar shortcut glyphs', () => {
  test('a non-Mac platform shows Ctrl+ shortcuts, not ⌘', async ({ page }) => {
    // Force a Windows platform BEFORE any app code runs so isMac() → false,
    // regardless of the host OS (the local machine may be a Mac). This
    // deterministically exercises the exact case that regressed.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    });

    await page.goto('/?e2e=1');
    await page.waitForSelector('[data-testid="docx-editor"]');

    const bold = page.locator('[aria-label="Bold"]').first();
    await expect(bold).toBeVisible();
    await bold.hover();

    // The tooltip shortcut hint should read Ctrl+B (not ⌘B) on this platform.
    await expect(page.getByText('Ctrl+B', { exact: false }).first()).toBeVisible({ timeout: 3000 });

    // And the Mac glyph must not be shown anywhere in the formatting bar hints.
    const hasCmdGlyph = await page.evaluate(() =>
      Array.from(document.querySelectorAll('body *')).some(
        (el) => el.childElementCount === 0 && /⌘/.test(el.textContent || '')
      )
    );
    expect(hasCmdGlyph).toBe(false);
  });
});

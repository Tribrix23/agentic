/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Mobile fit-to-width — on a phone-width viewport the editor auto-fits the page
 * to the screen on mount, so a Letter/A4 page (~816px) doesn't overflow at zoom
 * 1.0 and force the user to pinch just to read. On desktop the page stays 100%.
 */

import { test, expect } from '@playwright/test';

function readZoomPct(page: import('@playwright/test').Page): Promise<number> {
  return page
    .locator('[data-testid="docx-editor"]')
    .locator('text=/^\\d+%$/')
    .first()
    .textContent()
    .then((s) => Number((s ?? '').replace('%', '')));
}

test.describe('Mobile fit-to-width', () => {
  test.describe('phone viewport', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the page auto-fits the phone width on mount (zoom < 100%)', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      // Allow the fit-to-width rAF + the resulting state update to settle.
      await page.waitForTimeout(700);

      const zoom = await readZoomPct(page);
      // 390px screen / ~816px page ≈ 46%. Assert it shrank well below 100%.
      expect(zoom).toBeGreaterThan(20);
      expect(zoom).toBeLessThan(90);
    });
  });

  test.describe('desktop viewport', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('does not shrink on desktop (stays 100%)', async ({ page }) => {
      await page.goto('/?e2e=1');
      await page.waitForSelector('[data-testid="docx-editor"]');
      await page.waitForTimeout(700);

      const zoom = await readZoomPct(page);
      expect(zoom).toBe(100);
    });
  });
});

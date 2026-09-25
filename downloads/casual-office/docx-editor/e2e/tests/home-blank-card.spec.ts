/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Blank templates have no photographic render. They must show a clean
 * empty-state (a glyph tile), not an <img> whose SVG placeholder cropped to
 * flat grey and read as a broken thumbnail. The glyph must also be present in
 * the self-hosted Material Symbols subset — an absent one renders as wide raw
 * ligature text (e.g. "ARTICLE") instead of an icon.
 */

import { test, expect } from '@playwright/test';

test('blank template cards show an icon empty-state, not a broken image', async ({ page }) => {
  await page.goto('/');
  const blank = page.getByTestId('template-card-blank').first();
  await blank.waitFor({ timeout: 10000 });
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready);

  // No <img> in a blank card — it's an empty-state, not a thumbnail.
  await expect(blank.locator('img')).toHaveCount(0);

  // The Material Symbols glyph resolved to an icon (narrow), not raw ligature
  // text (wide). A 34px glyph is ~34px wide; unresolved text is far wider.
  const icon = blank.locator('.material-symbols-outlined').first();
  const box = await icon.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThan(60);
});

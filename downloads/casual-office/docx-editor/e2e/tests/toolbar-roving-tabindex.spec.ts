/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * The formatting toolbar follows the WAI-ARIA toolbar keyboard pattern: it is a
 * SINGLE tab stop (one button has tabindex=0, the rest tabindex=-1) and
 * Left/Right/Home/End move focus between items. Before this, every one of the
 * ~30 buttons was its own tab stop.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const BAR = '[data-testid="formatting-bar"]';

async function focusedLabel(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return (
      a?.getAttribute('aria-label') ||
      a?.getAttribute('title') ||
      a?.textContent ||
      ''
    ).trim();
  });
}

test.describe('formatting toolbar — roving tabindex', () => {
  test('is a single tab stop with arrow-key navigation', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();

    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();

    // Exactly one tabbable item — the whole toolbar is one tab stop.
    await expect(bar.locator('button[tabindex="0"]')).toHaveCount(1);
    // The rest are reachable only via the arrow keys.
    expect(await bar.locator('button[tabindex="-1"]').count()).toBeGreaterThan(1);

    // Focus the tab stop, then ArrowRight moves focus (and the stop) forward.
    await bar.locator('button[tabindex="0"]').focus();
    const first = await focusedLabel(page);
    await page.keyboard.press('ArrowRight');
    const second = await focusedLabel(page);
    expect(second).not.toBe(first);
    // Still exactly one tab stop after moving.
    await expect(bar.locator('button[tabindex="0"]')).toHaveCount(1);

    // ArrowLeft returns to the previous item.
    await page.keyboard.press('ArrowLeft');
    expect(await focusedLabel(page)).toBe(first);

    // End jumps to the last item, Home back to the first.
    await page.keyboard.press('End');
    const last = await focusedLabel(page);
    expect(last).not.toBe(first);
    await page.keyboard.press('Home');
    expect(await focusedLabel(page)).toBe(first);
  });

  test('a toolbar button still activates on click (no regression)', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('hello');
    await editor.selectText('hello');
    await editor.applyBold();
    // Bold button reflects the active state — the roving tabindex didn't break clicks.
    await expect(page.locator(`${BAR} button[aria-pressed="true"]`).first()).toBeVisible();
  });
});

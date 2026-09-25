/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Embedded-mode chrome (doc 39).
 *
 * `chrome:"embedded"` must keep the EDITING SURFACE — the formatting toolbar
 * AND the editing menus (Insert/Format/Tools/View/…) — while dropping only the
 * app shell (logo + document-name row, and the host-owned File/Help entries).
 *
 * Regression guard: an earlier embedded resolver welded the menu-bar default to
 * the app-shell default, so embedded hid the whole menu bar and stranded ~50
 * menu-only features. This locks the split.
 */
import { test, expect } from '@playwright/test';

import { EditorPage } from '../helpers/editor-page';

async function open(page: import('@playwright/test').Page, chrome: string) {
  await page.goto(`/?e2e=1&chrome=${chrome}`);
  const editor = new EditorPage(page);
  await editor.waitForReady();
  // NB: don't call editor.newDocument() — it drives File▸New, which embedded
  // mode prunes (the host owns file lifecycle). The chrome mounts on load.
  return editor;
}

test.describe('chrome:"embedded"', () => {
  test('keeps the formatting toolbar AND the editing menus', async ({ page }) => {
    await open(page, 'embedded');

    // Editing surface present: the formatting toolbar…
    await expect(page.locator('[data-testid="toolbar-bold"]')).toBeVisible();
    // …and the editing menus (the features that were stranded).
    const titleBar = page.locator('[data-testid="title-bar"]');
    await expect(titleBar).toBeVisible();
    for (const menu of ['Insert', 'Format', 'Tools']) {
      await expect(titleBar.getByRole('button', { name: menu, exact: true })).toBeVisible();
    }
  });

  test('drops the app shell — no document-name row, no About', async ({ page }) => {
    await open(page, 'embedded');
    // The document-name input (app shell) is gone.
    await expect(page.getByLabel('Document name')).toHaveCount(0);
    // Host-owned/branding menu entries pruned: no "About", no "Open".
    const titleBar = page.locator('[data-testid="title-bar"]');
    await titleBar.getByRole('button', { name: 'Help', exact: true }).click().catch(() => {});
    await expect(page.getByRole('menuitem', { name: /About/i })).toHaveCount(0);
  });

  test('screenshots: embedded light + dark', async ({ page }) => {
    await open(page, 'embedded');
    await page.screenshot({ path: 'screenshots/embedded-chrome-light.png' });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/embedded-chrome-dark.png' });
  });
});

test.describe('chrome:"full" (control — unchanged)', () => {
  test('keeps the full app shell (document name + File menu)', async ({ page }) => {
    await open(page, 'full');
    await expect(page.getByLabel('Document name')).toBeVisible();
    const titleBar = page.locator('[data-testid="title-bar"]');
    await expect(titleBar.getByRole('button', { name: 'File', exact: true })).toBeVisible();
    await page.screenshot({ path: 'screenshots/embedded-chrome-full-control.png' });
  });
});

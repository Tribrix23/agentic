/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Native form controls (unstyled inputs, selects, scrollbars) render using
 * the CSS `color-scheme` property, which is a SEPARATE mechanism from this
 * app's own [data-theme] attribute. The page declares
 * <meta name="color-scheme" content="light dark"> so the browser can pick
 * either — without an explicit `color-scheme: light|dark` synced to
 * [data-theme], a user with the OS/browser set to dark but the app
 * explicitly set to light would see unstyled native controls (e.g. a dialog
 * search box with no explicit background) render dark while the rest of the
 * dialog stayed light — a jarring dark box in an otherwise light UI.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.use({ viewport: { width: 900, height: 700 } });

test('OS prefers dark, app explicitly light: a dialog search input stays light', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    window.__deskApp__ = { themeMode: 'light' } as any;
  });

  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();

  await page.getByTestId('title-bar').getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: /keyboard shortcuts/i }).first().click();
  await page.locator('[data-testid="keyboard-shortcuts-dialog"]').waitFor({ timeout: 3000 });

  const input = page
    .locator('[data-testid="keyboard-shortcuts-dialog"] input[type="text"]')
    .first();
  expect(await input.evaluate((el) => getComputedStyle(el).colorScheme)).toBe('light');
  expect(await input.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(255, 255, 255)'
  );
});

test('OS prefers light, app explicitly dark: native controls follow the app', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    window.__deskApp__ = { themeMode: 'dark' } as any;
  });

  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();

  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
  ).toBe('dark');
});

test('Home page: color-scheme follows the app theme, not the raw OS preference', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    window.__deskApp__ = { themeMode: 'light' } as any;
  });
  await page.goto('/');
  await page.getByTestId('template-card-blank').first().waitFor({ timeout: 10000 });
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
  ).toBe('light');
});

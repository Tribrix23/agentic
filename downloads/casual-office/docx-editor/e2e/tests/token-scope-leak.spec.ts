/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * The editor's dark theme must NOT leak its shadcn bridge variables
 * (--background / --foreground / --card / --primary …) onto the host page's
 * <html>. Those names collide with tailwind/shadcn defaults, so a bare
 * `[data-theme='dark']` selector would overwrite an embedding app's own dark
 * tokens the moment the editor went dark. They are scoped to `.ep-root`
 * instead (matching the already-scoped light values). The namespaced DS
 * `--color-*` tokens stay global by design and are not asserted here.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// The editor resolves its `auto` color theme via prefers-color-scheme.
test.use({ colorScheme: 'dark' });

const SHADCN_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--popover',
  '--primary',
  '--secondary',
  '--muted',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
];

test('dark-mode shadcn bridge vars stay scoped to .ep-root (no <html> leak)', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.newDocument();
  await page.waitForTimeout(500);

  // Editor is in dark mode (data-theme set on <html> by the editor).
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe('dark');

  const result = await page.evaluate((vars) => {
    const htmlCS = getComputedStyle(document.documentElement);
    const ep = document.querySelector('.ep-root');
    const epCS = ep ? getComputedStyle(ep) : null;
    return {
      htmlLeaked: vars.filter((v) => htmlCS.getPropertyValue(v).trim() !== ''),
      epThemed: epCS ? vars.filter((v) => epCS.getPropertyValue(v).trim() !== '') : [],
    };
  }, SHADCN_VARS);

  // Nothing leaked onto the host <html> …
  expect(result.htmlLeaked).toEqual([]);
  // … but the editor root still carries the full dark bridge palette.
  expect(result.epThemed.length).toBe(SHADCN_VARS.length);
});

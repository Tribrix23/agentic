/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Opening a Markdown file via the in-editor File → Open used to convert it to
 * DOCX and show it in the DOCX editor (garbled), unlike the Home open path
 * which routes .md to the markdown/source editor. The editor now offers such
 * source files (.md/.txt/.rtf/.eml) to the host via `onOpenSourceFile`, and the
 * example app routes them to its markdown editor. This drives the hidden
 * File → Open input with a .md and asserts the switch.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test('File → Open of a .md routes to the markdown editor, not the DOCX editor', async ({
  page,
}) => {
  // Opening replaces the in-window doc; auto-accept the unsaved-changes confirm.
  page.on('dialog', (d) => d.accept());

  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();

  // Drive the hidden File → Open input (accepts .md/.markdown) directly.
  await page.locator('input[type="file"][accept*=".markdown"]').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Hello Markdown\n\nSome **bold** text.'),
  });

  // The app switches to the markdown/source editor instead of loading it as DOCX.
  await expect(page.locator('[data-testid="markdown-editor"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
});

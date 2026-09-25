/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EditorPage } from '../helpers/editor-page';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * File ▸ Open must not silently discard unsaved edits.
 *
 * Opening a file replaces the in-window document (loadBuffer →
 * resetForNewDocument + markDirty(false)). The beforeunload guard only covers
 * tab close/reload, so before this fix an in-app Open threw away unsaved work
 * with no warning. Now a native confirm gates the replacement.
 */

const SENTINEL = 'UnsavedGuardSentinel12345';
const FIXTURE = 'fixtures/generic-render-regression.docx';

test.describe('File > Open — unsaved-changes guard', () => {
  test('cancelling the confirm keeps the current (dirty) document', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText(SENTINEL);

    // Dirty now. Cancel the confirm → the open must be aborted.
    let confirmShown = false;
    page.once('dialog', (d) => {
      confirmShown = true;
      void d.dismiss();
    });

    const input = page.locator('input[type="file"][accept*=".docx"]');
    await input.setInputFiles(path.join(__dirname, '..', FIXTURE));
    await page.waitForTimeout(600);

    expect(confirmShown).toBe(true);
    // The document was NOT replaced — our unsaved text is still there.
    await expect(page.locator('.paged-editor__pages')).toContainText(SENTINEL);
  });

  test('accepting the confirm opens the new document', async ({ page }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText(SENTINEL);

    // Accept the confirm → the open proceeds and the unsaved doc is discarded.
    page.once('dialog', (d) => void d.accept());
    await editor.loadDocxFile(FIXTURE);

    await expect(page.locator('.paged-editor__pages')).not.toContainText(SENTINEL);
  });
});

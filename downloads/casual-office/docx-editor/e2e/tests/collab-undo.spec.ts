/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * In collab mode the native prosemirror-history plugin is disabled (it would
 * revert other users' edits), so undo/redo is owned by y-prosemirror's
 * UndoManager. That manager was added but never bound to a keymap, so Ctrl+Z /
 * Ctrl+Y did nothing in a collab session. This drives the real editor in collab
 * mode against an in-process Hocuspocus server and verifies keyboard undo/redo
 * now works.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, expect } from '@playwright/test';
import { Hocuspocus } from '@hocuspocus/server';
import { EditorPage } from '../helpers/editor-page';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLANK_DOCX = readFileSync(join(__dirname, '../fixtures/empty.docx'));

const PORT = 8901;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
let server: Hocuspocus;

test.beforeAll(async () => {
  server = new Hocuspocus({ port: PORT, quiet: true });
  await server.listen();
});

test.afterAll(async () => {
  await server.destroy().catch(() => {});
});

const PAGES = '.paged-editor__pages';

test('collab: keyboard undo and redo an edit', async ({ page }) => {
  await page.route('**/api/rooms/**/seed', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: BLANK_DOCX,
    })
  );

  const room = `undo-${Date.now()}`;
  const editor = new EditorPage(page);
  await page.goto(`/?e2e=1&room=${room}&backend=ws://localhost:${PORT}`);
  await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 30000 });
  await page.waitForTimeout(1200); // provider + IDB settle

  const SENTINEL = `UNDOABLE${Date.now()}`;
  await editor.focus();
  await editor.typeText(SENTINEL);
  await page.waitForTimeout(700); // let the UndoManager close the capture group
  await expect(page.locator(PAGES)).toContainText(SENTINEL);

  // Undo — the typed text is removed (previously a no-op in collab).
  await page.keyboard.press(`${MOD}+z`);
  await page.waitForTimeout(400);
  await expect(page.locator(PAGES)).not.toContainText(SENTINEL);

  // Redo — the text comes back. (Uses Ctrl/Cmd+Y; the equivalent Mod+Shift+Z
  // is also bound, but Playwright's synthetic Meta+Shift+z doesn't reliably
  // resolve through prosemirror-keymap in headless Chromium.)
  await page.keyboard.press(`${MOD}+y`);
  await page.waitForTimeout(400);
  await expect(page.locator(PAGES)).toContainText(SENTINEL);
});

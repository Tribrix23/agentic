/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * BROWSER verification of the offline-persistence wiring (useCollab +
 * IndexeddbPersistence). Drives the real editor in collab mode against an
 * in-process Hocuspocus server (the same server the convergence test uses),
 * with REAL browser IndexedDB — closing the gate the fake-indexeddb unit test
 * can't (the full editor reload flow).
 *
 * The collab room seed normally comes from the collab server's
 * `/api/rooms/:room/seed` REST surface (the CasualOffice/collab submodule,
 * not running in this repo's e2e). We route-mock that ONE endpoint with a
 * blank .docx so the editor mounts; everything else — the Y.Doc, the WS
 * provider, and the IndexeddbPersistence under test — is the real thing.
 *
 * Covers the two safety-critical checks:
 *   1. Edits survive a page reload.
 *   2. Edits survive a reload with the server DOWN — content is restored from
 *      IndexedDB, not the server (true offline durability), and the editor
 *      still mounts (no hang, no blank-doc overwrite).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test, expect } from '@playwright/test';
import { Hocuspocus } from '@hocuspocus/server';
import { EditorPage } from '../helpers/editor-page';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLANK_DOCX = readFileSync(join(__dirname, '../fixtures/empty.docx'));

const PORT = 8899;
let server: Hocuspocus;

test.beforeAll(async () => {
  server = new Hocuspocus({ port: PORT, quiet: true });
  await server.listen();
});

test.afterAll(async () => {
  await server.destroy().catch(() => {});
});

const PAGES = '.paged-editor__pages';

function collabUrl(room: string): string {
  return `/?e2e=1&room=${room}&backend=ws://localhost:${PORT}`;
}

// Serve the blank room seed for the /api/rooms/:room/seed download so CollabApp
// mounts the editor without the collab server running.
async function mockSeed(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/rooms/**/seed', (route) =>
    route.fulfill({
      status: 200,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: BLANK_DOCX,
    })
  );
}

test.describe('offline persistence — real browser + IndexedDB', () => {
  test('an edit survives a page reload (collab + IndexedDB)', async ({ page }) => {
    const room = `idb-reload-${Date.now()}`;
    const editor = new EditorPage(page);
    await mockSeed(page);

    await page.goto(collabUrl(room));
    await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 30000 });
    await page.waitForTimeout(1200); // let the provider + IDB sync settle

    const UNIQUE = `IDBRELOAD${Date.now()}`;
    await editor.focus();
    await editor.typeText(UNIQUE);
    await page.waitForTimeout(1500); // flush to IndexedDB + server

    await page.reload();
    await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 30000 });
    await page.waitForTimeout(1800);

    await expect(page.locator(PAGES)).toContainText(UNIQUE);
  });

  test('an edit survives a reload with the server DOWN (offline → IndexedDB restores)', async ({
    page,
  }) => {
    const room = `idb-offline-${Date.now()}`;
    const editor = new EditorPage(page);
    await mockSeed(page);

    await page.goto(collabUrl(room));
    await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 30000 });
    await page.waitForTimeout(1200);

    const UNIQUE = `IDBOFFLINE${Date.now()}`;
    await editor.focus();
    await editor.typeText(UNIQUE);
    await page.waitForTimeout(1500); // ensure it's flushed to IndexedDB

    // Take the server offline, then reload — content must come from IndexedDB.
    await server.destroy();
    await page.reload();
    await page.waitForSelector('[data-testid="docx-editor"]', { timeout: 30000 });
    await page.waitForTimeout(2000);

    await expect(page.locator(PAGES)).toContainText(UNIQUE);

    // Restart the server so afterAll's destroy() and any later tests are happy.
    server = new Hocuspocus({ port: PORT, quiet: true });
    await server.listen();
  });
});

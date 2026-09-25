/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/*
 * Characterization test for handleSave's serialize + clear-tracker assembly.
 *
 * handleSave (DocxEditor) snapshots PM content, applies comments/footnotes,
 * builds selective-save options, serializes via toBuffer, and THEN clears the
 * change tracker. A tracked insertion made in suggesting mode must serialize as
 * <w:ins> and survive a save → reload — i.e. clearTrackedChanges running after
 * toBuffer must not corrupt the emitted bytes, and the selective path must not
 * drop the insertion.
 *
 * This pins that behaviour BEFORE the useDocumentIO save-path extraction, so
 * that refactor has a safety net for its load-bearing mutation order (the
 * round-trip fidelity gate covers the serializer, not this assembly).
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const PAGES = '[data-testid="docx-editor"] .paged-editor__pages';
const MODE_TRIGGER = 'button[aria-label*="Ctrl+Shift+E"]';

test('handleSave: a tracked insertion survives save → reload', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/demo.docx');
  await page.waitForTimeout(1000);

  expect(await page.locator(`${PAGES} .docx-insertion`).count()).toBe(0);

  // Suggesting mode → typed text becomes a tracked insertion.
  await page.locator(MODE_TRIGGER).click();
  await page.getByRole('button', { name: /Suggesting/i }).click();
  await page.waitForTimeout(300);

  const UNIQUE = `ZZTRACKED${Date.now()}`;
  await editor.focusParagraph(1);
  await editor.typeText(UNIQUE);
  await page.waitForTimeout(600);
  await expect(
    page.locator(`${PAGES} .docx-insertion`).filter({ hasText: UNIQUE }).first()
  ).toBeVisible();

  // Save through handleSave (the imperative exportDocx = handleSave path).
  const b64 = await page.evaluate(async () => {
    // @ts-expect-error e2e hook
    const buf: ArrayBuffer | null = await window.__editorRef?.current?.exportDocx?.();
    if (!buf) return null;
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  });
  expect(b64).toBeTruthy();

  const out = join(tmpdir(), `rt-tracked-${Date.now()}.docx`);
  writeFileSync(out, Buffer.from(b64 as string, 'base64'));

  // Reload the saved bytes — the tracked insertion must still be present and
  // still marked as an insertion (not flattened, not dropped).
  await editor.loadDocxFile(out);
  await page.waitForTimeout(1800);
  await expect(
    page.locator(`${PAGES} .docx-insertion`).filter({ hasText: UNIQUE }).first()
  ).toBeVisible();
});

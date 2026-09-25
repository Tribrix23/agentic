/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Regression: double-clicking a header/footer to edit it always read/wrote
// the DOCUMENT'S LAST section's header/footer file, regardless of which
// page/section was actually clicked. In a multi-section document, editing
// what you SEE on a non-final section's page silently overwrote the final
// section's header/footer instead — a data-corruption risk (#14).
test('double-clicking a mid-document section header edits that section, not the final one', async ({
  page,
}) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.loadDocxFile('fixtures/multi-section-headers.docx');
  await page.waitForTimeout(1500);

  // Fixture: section A (pages 1-2, no header), section B (pages 3-4, "Section
  // B Header"), section C / final (pages 5-6, "Section C Final Header").
  const pageEls = page.locator('.paged-editor__pages > *');
  const count = await pageEls.count();
  expect(count).toBeGreaterThanOrEqual(5);

  // Double-click section B's header (a middle page, not the last). Fixture
  // layout: pages 0-1 = section A (no header), pages 2-3 = section B
  // ("Section B Header"), page 4 = section C / final ("Section C Final
  // Header"). Locator dblclick() auto-scrolls precisely to the target,
  // unlike a manual scrollIntoViewIfNeeded() + boundingBox() on the whole
  // (taller-than-viewport) page, which can leave the header off-screen.
  const headerEl = pageEls.nth(2).locator('.layout-page-header');
  await headerEl.dblclick({ position: { x: 20, y: 10 } });
  await page.waitForTimeout(400);

  // The inline header editor should now show section B's own text.
  const hfEditor = page.locator('[data-testid="docx-editor"] .hf-editor-pm');
  await expect(hfEditor).toContainText('Section B Header', { timeout: 3000 });

  // Type an edit, then Escape to save + close (see header-footer-tables.spec.ts).
  await page.keyboard.type(' EDITED');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Section B's header changed...
  const readHeader = async (index: number): Promise<string> => {
    await pageEls.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    return (await pageEls.nth(index).locator('.layout-page-header').textContent()) ?? '';
  };
  expect(await readHeader(2)).toContain('EDITED');

  // ...but section C (final)'s header must be UNCHANGED — this is the exact
  // silent-corruption case: pre-fix, the edit would have landed there
  // instead of on section B.
  const sectionCHeaderText = await readHeader(count - 1);
  expect(sectionCHeaderText).not.toContain('EDITED');
  expect(sectionCHeaderText).toContain('Section C Final Header');
});

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Find & Replace must operate on an open header/footer, not the main body.
 *
 * The HF inline editor is a separate ProseMirror view with its own document.
 * Previously the find handlers hardcoded the main body view, so searching while
 * editing a header found "0 of 0" and Replace did nothing — the header text was
 * invisible to Find. The handlers now target the active editor (HF when one is
 * open) and the shared find-highlight plugin paints match decorations inside
 * the HF view.
 */
import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

const TESTID = '[data-testid="docx-editor"]';
const HEADER = `${TESTID} .layout-page-header`;
const HF_PM = `${TESTID} .hf-editor-pm`;

async function openHeaderEditor(page: import('@playwright/test').Page) {
  const header = page.locator(HEADER).first();
  await expect(header).toBeAttached();
  const box = await header.boundingBox();
  await page.mouse.dblclick(box!.x + 40, box!.y + box!.height / 2);
  await page.waitForTimeout(400);
  await expect(page.locator(`${TESTID} .paged-editor--editing-header`)).toBeAttached();
}

test('Find highlights and counts matches inside the open header', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.loadDocxFile('fixtures/header-with-table.docx');
  await page.waitForTimeout(1500);

  await openHeaderEditor(page);

  // Open Find and search for text that only exists in the header
  // ("HEADER LOGO" + "HEADER TEXT" → two matches).
  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+f`);
  await page.locator('[data-testid="find-replace-dialog"]').waitFor({ timeout: 3000 });
  await page.locator('[data-testid="find-input"]').fill('HEADER');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(400);

  // Match decorations are painted inside the HF editor (not the body) — the core
  // regression: before the fix this was 0 because Find scanned the body doc.
  const hfHighlights = page.locator(`${HF_PM} .find-match`);
  await expect(hfHighlights).toHaveCount(2);

  // And the dialog reports the header matches, not "no results".
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await expect(dlg).toContainText('of 2 matches');
});

test('Replace All rewrites the open header text', async ({ page }) => {
  const ed = new EditorPage(page);
  await ed.goto();
  await ed.waitForReady();
  await ed.loadDocxFile('fixtures/header-with-table.docx');
  await page.waitForTimeout(1500);

  await openHeaderEditor(page);

  const mod = /Mac/i.test(await page.evaluate(() => navigator.platform)) ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+h`);
  await page.locator('[data-testid="find-replace-dialog"]').waitFor({ timeout: 3000 });
  const dlg = page.locator('[data-testid="find-replace-dialog"]');
  await page.locator('[data-testid="find-input"]').fill('HEADER');
  await page.locator('[data-testid="find-input"]').press('Enter');
  await page.waitForTimeout(300);
  await page.locator('#replace-text').fill('BANNER');
  await page.waitForTimeout(150);

  await dlg.getByRole('button', { name: /^Replace All$/ }).click();
  await page.waitForTimeout(400);

  // The header editor now shows the replaced text; "HEADER" is gone.
  await expect(page.locator(HF_PM)).toContainText('BANNER LOGO');
  await expect(page.locator(HF_PM)).toContainText('BANNER TEXT');
  await expect(page.locator(HF_PM)).not.toContainText('HEADER');
});

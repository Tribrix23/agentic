/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Regression: every page in a multi-section document used to show the SAME
// header/footer — whichever section's ref was found last while scanning the
// whole document — instead of each page showing its own section's
// header/footer. Fixture has 3 sections: A (no header/footer refs at all),
// B (its own header/footer), C / final (a DIFFERENT header/footer).
test.describe('multi-section header/footer', () => {
  test('each page renders its own section header/footer, not a document-wide default', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/multi-section-headers.docx');
    await page.waitForTimeout(1500);

    const pageEls = page.locator('.paged-editor__pages > *');
    const count = await pageEls.count();
    expect(count).toBeGreaterThanOrEqual(5);

    const read = async (i: number) => {
      await pageEls.nth(i).scrollIntoViewIfNeeded();
      return pageEls.nth(i).evaluate((el) => ({
        header: el.querySelector('.layout-page-header')?.textContent ?? null,
        footer: el.querySelector('.layout-page-footer')?.textContent ?? null,
      }));
    };

    // Page 1: section A — no header/footer reference at all.
    const pageA = await read(0);
    expect(pageA.header ?? '').toBe('');
    expect(pageA.footer ?? '').toBe('');

    // Last page: section C (final) — its own distinct header/footer.
    const pageC = await read(count - 1);
    expect(pageC.header).toContain('Section C Final Header');
    expect(pageC.footer).toContain('Section C Final Footer');

    // Some page in between: section B — its own header/footer, distinct
    // from BOTH section A (none) and section C (the bug this guards
    // against: every page collapsing to whichever section resolves last).
    const between = [];
    for (let i = 1; i < count - 1; i++) {
      between.push(await read(i));
    }
    expect(between.some((p) => p.header?.includes('Section B Header'))).toBe(true);
    expect(between.some((p) => p.footer?.includes('Section B Footer'))).toBe(true);
    expect(between.every((p) => !p.header?.includes('Final'))).toBe(true);
  });
});

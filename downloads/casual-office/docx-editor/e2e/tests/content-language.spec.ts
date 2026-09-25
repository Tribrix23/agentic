/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Content language (WCAG 3.1.1) — the editor root carries a BCP-47 `lang` so
 * assistive tech pronounces the document content correctly, and the off-screen
 * editable surface (which is what screen readers actually read) inherits it.
 */

import { test, expect } from '@playwright/test';

test.describe('Content language', () => {
  test('the editor root has a lang and the editable surface inherits it', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.waitForSelector('[data-testid="docx-editor"]');

    const rootLang = await page
      .locator('[data-testid="docx-editor"]')
      .first()
      .getAttribute('lang');
    expect(rootLang).toBeTruthy();

    // The ProseMirror editable (the surface AT reads) inherits lang from the
    // nearest ancestor that declares it — that's the editor root.
    const inheritedLang = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (!pm) return null;
      const owner = pm.closest('[lang]') as HTMLElement | null;
      return owner?.getAttribute('lang') ?? null;
    });
    expect(inheritedLang).toBeTruthy();
  });
});

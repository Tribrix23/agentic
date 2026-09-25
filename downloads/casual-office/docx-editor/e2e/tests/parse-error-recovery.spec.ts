/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Parse-error recovery — a document that fails to open in the editor used to
 * show a dead-end error screen with no way forward. It now offers a "Try again"
 * recovery action.
 */

import { test, expect } from '@playwright/test';

test.describe('Parse-error recovery', () => {
  test('a failed document load shows a Try again action', async ({ page }) => {
    await page.goto('/?e2e=1');
    await page.waitForSelector('[data-testid="docx-editor"]');

    // Feed garbage bytes as a .docx to force the parse-error path (invalid zip).
    await page.locator('input[type="file"][accept*=".docx"]').setInputFiles({
      name: 'corrupt.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('this is definitely not a valid .docx zip archive'),
    });

    // The error screen now carries a recovery affordance instead of dead-ending.
    await expect(page.getByTestId('parse-error-retry')).toBeVisible({ timeout: 8000 });
  });
});

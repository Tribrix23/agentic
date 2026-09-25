/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

// Clicking the rail's Comments toggle on an empty doc used to flip
// `aria-pressed` with nothing else visible — looks broken. It now renders a
// designed empty state ("No comments yet") in the comments sidebar instead of
// a transient toast.
test('Comments rail toggle on an empty doc shows a designed empty state', async ({ page }) => {
  const editor = new EditorPage(page);
  await editor.goto();
  await editor.waitForReady();
  await editor.newDocument();

  await page.getByTestId('rail-comments').click();

  const empty = page.getByTestId('comments-empty-state');
  await expect(empty).toBeVisible();
  await expect(empty.getByText('No comments yet')).toBeVisible();
});

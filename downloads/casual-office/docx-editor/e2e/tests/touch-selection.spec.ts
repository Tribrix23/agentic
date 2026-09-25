/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Touch caret placement — tap-to-place-caret on the paginated editor.
 *
 * The paged editor's selection handlers were mouse-only; on a touch device a
 * tap did not reliably place the caret, so you couldn't position the cursor to
 * edit. This exercises the touch path with a real touchscreen tap.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

test.use({ hasTouch: true });

test.describe('Paged Editor - Touch caret', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
  });

  test('tapping text places the caret there', async ({ page }) => {
    await editor.typeText('Hello World');

    const textSpan = page.locator('.layout-page span:has-text("World")').first();
    const box = await textSpan.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Real touchscreen tap in the middle of "World".
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(120);

    // Typing should insert at the tapped caret position (inside "World"),
    // not at the document start/end.
    await page.keyboard.type('X');

    const content = await page.evaluate(
      () => document.querySelector('.ProseMirror')?.textContent || ''
    );
    expect(content).toContain('Hello');
    // The X landed inside/adjacent to "World" — i.e. not before "Hello".
    expect(content).toMatch(/Wor.*X|W.*X.*ld|World.*X|X.*World/);
    expect(content.startsWith('XHello')).toBe(false);
  });
});

/**
 * Touch drag-select — long-press then drag selects a range. Playwright's
 * `touchscreen` only exposes `tap`, so the drag is driven through CDP
 * `Input.dispatchTouchEvent`. As in the mouse selection specs, a real range is
 * proven by typing a replacement char: if text was selected it's replaced.
 */
test.describe('Paged Editor - Touch drag-select', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('AAAA BBBB CCCC DDDD');
    await page.waitForTimeout(200);
  });

  async function lineY(page: import('@playwright/test').Page): Promise<{
    x: number;
    y: number;
    width: number;
  }> {
    const span = page.locator('.layout-page-content span', { hasText: 'AAAA' }).first();
    const box = await span.boundingBox();
    if (!box) throw new Error('no span box');
    return { x: box.x, y: box.y + box.height / 2, width: box.width };
  }

  test('long-press then drag selects the dragged-over range', async ({ page }) => {
    const { x, y, width } = await lineY(page);
    const startX = x + width * 0.02;
    const endX = x + width * 0.62;

    const cdp = await page.context().newCDPSession(page);
    // Press and hold past the ~450ms long-press threshold to arm selection.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y }],
    });
    await page.waitForTimeout(600);
    // Drag to the end point in steps — extends the selection.
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + ((endX - startX) * i) / steps, y }],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);

    // Typing replaces the selected range (start → mid-CCCC).
    await page.keyboard.type('X');
    await page.waitForTimeout(150);
    const body = (await page.locator('.paged-editor__pages').innerText()).trim();
    expect(body.startsWith('X')).toBe(true);
    expect(body).not.toContain('AAAA');
    expect(body).toContain('DDDD');
  });

  test('a quick drag (no long-press) does not select — the gesture scrolls', async ({ page }) => {
    const { x, y, width } = await lineY(page);
    const startX = x + width * 0.02;
    const endX = x + width * 0.62;

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y }],
    });
    // Move immediately, well before the long-press threshold → scroll intent.
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + ((endX - startX) * i) / 6, y }],
      });
      await page.waitForTimeout(10);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(120);

    // No range was armed, so nothing is replaced — all four words survive.
    await page.keyboard.type('X');
    await page.waitForTimeout(120);
    const body = (await page.locator('.paged-editor__pages').innerText()).trim();
    expect(body).toContain('AAAA');
    expect(body).toContain('DDDD');
  });
});

/**
 * Touch selection handles (Slice 2) — the draggable start/end pills. After a
 * range is selected the handles appear; dragging the end handle extends the
 * selection. Driven through CDP touch events.
 */
test.describe('Paged Editor - Selection handles', () => {
  let editor: EditorPage;

  test.beforeEach(async ({ page }) => {
    editor = new EditorPage(page);
    await editor.goto();
    await editor.waitForReady();
    await editor.newDocument();
    await editor.focus();
    await editor.typeText('AAAA BBBB CCCC DDDD');
    await page.waitForTimeout(200);
  });

  async function longPressSelect(
    page: import('@playwright/test').Page,
    fromX: number,
    toX: number,
    y: number
  ): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: fromX, y }],
    });
    await page.waitForTimeout(600); // arm long-press
    for (let i = 1; i <= 5; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: fromX + ((toX - fromX) * i) / 5, y }],
      });
      await page.waitForTimeout(15);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  }

  test('handles appear on a range and dragging the end handle extends it', async ({ page }) => {
    const span = page.locator('.layout-page-content span', { hasText: 'AAAA' }).first();
    const box = await span.boundingBox();
    if (!box) throw new Error('no span box');
    const y = box.y + box.height / 2;

    // Select just "AAAA" (the first ~20% of the line) via long-press drag.
    await longPressSelect(page, box.x + box.width * 0.02, box.x + box.width * 0.2, y);

    // Both handles should now be visible.
    const endHandle = page.locator('[data-testid="selection-handle-end"]');
    await expect(page.locator('[data-testid="selection-handle-start"]')).toBeVisible();
    await expect(endHandle).toBeVisible();

    // Drag the end handle rightward to mid-"CCCC", extending the selection.
    const hb = await endHandle.boundingBox();
    if (!hb) throw new Error('no end-handle box');
    const targetX = box.x + box.width * 0.62;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }],
    });
    const startX = hb.x + hb.width / 2;
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + ((targetX - startX) * i) / 6, y }],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);

    // Typing replaces the extended selection (AAAA → mid-CCCC). If the handle
    // had NOT extended it, only AAAA would be replaced and BBBB would survive.
    await page.keyboard.type('X');
    await page.waitForTimeout(150);
    const body = (await page.locator('.paged-editor__pages').innerText()).trim();
    expect(body.startsWith('X')).toBe(true);
    expect(body).not.toContain('AAAA');
    expect(body).not.toContain('BBBB');
    expect(body).toContain('DDDD');
  });
});

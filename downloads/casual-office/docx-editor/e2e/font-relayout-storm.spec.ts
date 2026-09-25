/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Empirical repro for issue #303.
 *
 * BUG 1 — font-load relayout storm: every FontFaceSet `loadingdone` event (one
 * per @font-face variant, plus the Material Symbols icon font and UI-chrome
 * fonts) used to trigger a synchronous, cache-nuking full relayout that rebuilt
 * the page DOM. K font faces = K page rebuilds (O(K×N)) — visible as click-time
 * flicker and, on Linux, an OOM. The fix coalesces a burst of *relevant* events
 * into a single relayout and gates out icon/UI-font events entirely.
 *
 * We measure page rebuilds directly with a MutationObserver on
 * `.paged-editor__pages` (each full relayout repaints its subtree). The load
 * cascade is simulated deterministically by dispatching `loadingdone` events on
 * `document.fonts`, so the assertion doesn't depend on network/font timing:
 *
 *   - K synthetic events with no faces (always pass the relevance gate) must
 *     collapse to a small, bounded number of relayout batches (1–2), NOT K.
 *   - K synthetic events for a font the document does NOT use must produce ZERO
 *     relayouts (the relevance gate drops icon/UI-font events).
 *   - At steady state, clicking must cause ZERO page rebuilds (the pre-existing
 *     pure-selection-change guard must keep working).
 *
 * BUG 2 — caret sized to the full line box: at line-spacing > 1 the caret was
 * 1.5–2× too tall. We assert the caret height tracks the run's font-size, not
 * the line box, at 1.5 line spacing.
 */

import { test, expect } from '@playwright/test';
import { EditorPage } from './helpers';

const SYNTHETIC_EVENTS = 15;

// Install a MutationObserver that counts page-rebuild "batches" (observer
// callbacks that add/remove page or line nodes under `.paged-editor__pages`).
// Each full relayout repaints the subtree → one batch. Returns raw record and
// batch counters plus reset/read hooks on window.__RELAYOUT_PROBE__.
async function installProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.querySelector('.paged-editor__pages');
    if (!container) throw new Error('.paged-editor__pages not found');
    const state = { records: 0, batches: 0 };
    const touchesPages = (n: Node): boolean => {
      const el = n as HTMLElement;
      if (!el.classList) return false;
      return (
        el.classList.contains('layout-page') ||
        el.classList.contains('layout-line') ||
        !!el.querySelector?.('.layout-page, .layout-line')
      );
    };
    const observer = new MutationObserver((records) => {
      let batchTouched = false;
      for (const r of records) {
        if (r.type !== 'childList') continue;
        const added = Array.from(r.addedNodes).some(touchesPages);
        const removed = Array.from(r.removedNodes).some(touchesPages);
        if (added || removed) {
          state.records += 1;
          batchTouched = true;
        }
      }
      if (batchTouched) state.batches += 1;
    });
    observer.observe(container, { childList: true, subtree: true });
    (window as unknown as { __RELAYOUT_PROBE__: unknown }).__RELAYOUT_PROBE__ = {
      reset: () => {
        state.records = 0;
        state.batches = 0;
      },
      read: () => ({ ...state }),
    };
  });
}

async function readProbe(page: import('@playwright/test').Page): Promise<{
  records: number;
  batches: number;
}> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __RELAYOUT_PROBE__: { read: () => { records: number; batches: number } };
        }
      ).__RELAYOUT_PROBE__.read()
  );
}

async function resetProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __RELAYOUT_PROBE__: { reset: () => void } }).__RELAYOUT_PROBE__.reset()
  );
}

test.describe('issue #303 — font-load relayout storm + caret size', () => {
  test('load cascade coalesces to a bounded relayout count, gates UI fonts, and clicks stay 0', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/complex-styles.docx');
    await editor.waitForReady();
    // Ensure any real font-load activity has fully settled before measuring.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    await installProbe(page);

    // (a) Steady-state click must cause ZERO page rebuilds (pure-selection guard).
    await resetProbe(page);
    const box = await page.locator('.layout-page').first().boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
    }
    await page.waitForTimeout(250);
    const afterClick = await readProbe(page);
    expect(afterClick.batches, 'steady-state click page rebuilds').toBe(0);

    // (b) Relevance gate: K events for a font the doc does NOT use → 0 relayouts.
    await resetProbe(page);
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        const e = new Event('loadingdone');
        Object.defineProperty(e, 'fontfaces', {
          value: [{ family: '__NotADocumentFont__' }],
        });
        document.fonts.dispatchEvent(e);
      }
    }, SYNTHETIC_EVENTS);
    await page.waitForTimeout(400);
    const gated = await readProbe(page);
    expect(gated.batches, 'gated (irrelevant-font) relayouts').toBe(0);

    // (c) Coalescing: K relevant events (no faces → always pass gate) → 1 relayout.
    await resetProbe(page);
    await page.evaluate((n) => {
      for (let i = 0; i < n; i++) {
        // A plain event has no `fontfaces`, so the relevance gate treats the
        // faces as unknown and relays out — exactly the pre-fix trigger path.
        document.fonts.dispatchEvent(new Event('loadingdone'));
      }
    }, SYNTHETIC_EVENTS);
    await page.waitForTimeout(400);
    const coalesced = await readProbe(page);

    // Pre-fix: each of the K events ran a synchronous relayout → ~K batches.
    // Post-fix: the burst collapses into a single trailing relayout.
    expect(
      coalesced.batches,
      `coalesced relayouts for ${SYNTHETIC_EVENTS} font events`
    ).toBeGreaterThan(0);
    expect(
      coalesced.batches,
      `coalesced relayouts for ${SYNTHETIC_EVENTS} font events`
    ).toBeLessThanOrEqual(2);

    // eslint-disable-next-line no-console
    console.log(
      `[#303 repro] ${SYNTHETIC_EVENTS} synthetic font-load events → ` +
        `${coalesced.batches} relayout batch(es), ${coalesced.records} page-mutation record(s); ` +
        `gated events → ${gated.batches}; steady-state click → ${afterClick.batches}`
    );
  });

  test('caret height tracks the run font, not the line box, at 1.5 line spacing', async ({
    page,
  }) => {
    const editor = new EditorPage(page);
    await editor.goto();
    await editor.loadDocxFile('fixtures/complex-styles.docx');
    await editor.waitForReady();

    // Apply 1.5 line spacing to the whole document so the line box is clearly
    // taller than the glyph height — the case that used to make the caret 1.5×
    // too tall.
    await page.keyboard.press('Control+a');
    await editor.setLineSpacing('1.5');
    await page.waitForTimeout(200);

    // Place the caret inside a painted text run.
    const runBox = await page.locator('.layout-page .layout-run').first().boundingBox();
    expect(runBox).not.toBeNull();
    if (!runBox) return;
    await page.mouse.click(runBox.x + 2, runBox.y + runBox.height / 2);
    await page.waitForTimeout(150);

    const measured = await page.evaluate(() => {
      const caret = document.querySelector('[data-testid="caret"]') as HTMLElement | null;
      if (!caret) return null;
      const caretHeight = parseFloat(caret.style.height);
      // The run nearest the caret x/y — read its rendered font-size and its line
      // box height for comparison.
      const runs = Array.from(
        document.querySelectorAll('.layout-page .layout-run')
      ) as HTMLElement[];
      const cr = caret.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const r of runs) {
        const rr = r.getBoundingClientRect();
        const dx = Math.max(rr.left - cr.left, cr.left - rr.right, 0);
        const dy = Math.max(rr.top - cr.top, cr.top - rr.bottom, 0);
        const d = dx + dy;
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      if (!best) return null;
      const fontSize = parseFloat(getComputedStyle(best).fontSize);
      const lineEl = best.closest('.layout-line') as HTMLElement | null;
      const lineHeight = lineEl ? lineEl.offsetHeight : 0;
      return { caretHeight, fontSize, lineHeight };
    });

    expect(measured).not.toBeNull();
    if (!measured) return;
    const { caretHeight, fontSize, lineHeight } = measured;

    // Caret ≈ 1.2× the run font-size (≈ ascent + descent), NOT the full line box.
    expect(caretHeight).toBeGreaterThan(fontSize * 0.9);
    expect(caretHeight).toBeLessThan(fontSize * 1.6);
    // With 1.5 line spacing the line box is meaningfully taller than the caret.
    expect(caretHeight).toBeLessThan(lineHeight);

    // eslint-disable-next-line no-console
    console.log(
      `[#303 caret] fontSize=${fontSize.toFixed(1)}px caretHeight=${caretHeight.toFixed(
        1
      )}px lineHeight=${lineHeight.toFixed(1)}px (ratio caret/font=${(caretHeight / fontSize).toFixed(
        2
      )})`
    );
  });
});

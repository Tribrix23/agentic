/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * AI surfaces contract — SelectionAskAi pill + DocOpsPanel streaming.
 *
 * No live LLM calls. Tests cover:
 *  - SelectionAskAi pill appears only when text is selected AND
 *    aiEnabled is true (simulated via API key in localStorage or
 *    window.__TAURI__ mock)
 *  - Pill disappears on selection clear / Escape
 *  - DocOpsPanel SSE: mock fetch streams tokens; panel shows committed
 *    message after stream completes
 *  - DocOpsPanel: API-key setup view when key is absent
 *  - Model-gating: pill hidden when no model; appears after
 *    ai:model-changed event fires with a modelId
 *
 * The tests inject a fake `window.__TAURI__` via addInitScript to
 * trigger the desktop code path without an actual Tauri shell.
 *
 * Navigation convention: `?e2e=1` bypasses the home page and opens
 * the editor directly (same as EditorPage.goto()).
 */

import { expect, Page, test } from '@playwright/test';
import { EditorPage } from '../helpers/editor-page';

/**
 * Reliable editor selection for headless: type via the editor, then set the PM
 * selection through the `?e2e=1` editor ref. Raw `keyboard.press('Control+A')`
 * does not register a ProseMirror selection in headless Chromium (the editing
 * view is off-screen), so the on-selection pill never opens.
 */
async function typeAndSelect(page: Page, text: string): Promise<void> {
  const editor = new EditorPage(page);
  await editor.typeText(text);
  const ok = await editor.selectText(text);
  expect(ok).toBe(true);
  await page.waitForTimeout(120);
}

// Key checked by DocxEditor to enable the SelectionAskAi pill (web path).
// Unified with the panel's key: DocxEditor now reads API_KEY_STORAGE, the same
// 'casual_docops_api_key' the panel writes (previously a divergent literal).
const DOCX_EDITOR_AI_KEY = 'casual_docops_api_key';
// Key checked by DocOpsPanel to skip the key-setup screen.
const DOCOPS_PANEL_KEY = 'casual_docops_api_key';
const FAKE_KEY = 'sk-ant-test-fake-key';

/** Navigate to the editor and wait for the layout canvas. */
async function loadEditor(page: Page) {
  await page.goto('/?e2e=1');
  await page.waitForSelector('.paged-editor__pages', { timeout: 20000 });
}

// ── SelectionAskAi ────────────────────────────────────────────────────────────

test.describe('SelectionAskAi pill', () => {
  test('hidden when no text is selected — web transport', async ({ page }) => {
    await page.addInitScript(
      ({ k, s }) => {
        try {
          localStorage.setItem(s, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, s: DOCX_EDITOR_AI_KEY }
    );
    await loadEditor(page);

    const pill = page.locator('[data-testid="selection-ask-ai-pill"]');
    await expect(pill).not.toBeVisible();
  });

  test('appears after selecting text — web transport with saved key', async ({ page }) => {
    await page.addInitScript(
      ({ k, s }) => {
        try {
          localStorage.setItem(s, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, s: DOCX_EDITOR_AI_KEY }
    );
    await loadEditor(page);

    await typeAndSelect(page, 'Hello world');

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).toBeVisible();
  });

  test('hidden when Tauri model is not loaded', async ({ page }) => {
    // addInitScript runs before page JS — inject fake __TAURI__ returning null model.
    await page.addInitScript(() => {
      (window as any).__TAURI__ = {
        core: { invoke: async (cmd: string) => (cmd === 'ai_get_active_model' ? null : null) },
        event: { listen: async () => () => {} },
      };
    });
    await loadEditor(page);

    await typeAndSelect(page, 'Some text');

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).not.toBeVisible();
  });

  test('appears after ai:model-changed fires with a model id', async ({ page }) => {
    // Wire __TAURI__ with a listen that stores callbacks on window.__tauriListeners__.
    await page.addInitScript(() => {
      const listeners: Record<string, ((e: { payload: unknown }) => void)[]> = {};
      (window as any).__TAURI__ = {
        core: { invoke: async (cmd: string) => (cmd === 'ai_get_active_model' ? null : null) },
        event: {
          listen: async (event: string, cb: (e: { payload: unknown }) => void) => {
            listeners[event] = listeners[event] ?? [];
            listeners[event].push(cb);
            (window as any).__tauriListeners__ = listeners;
            return () => {};
          },
        },
      };
    });
    await loadEditor(page);

    await typeAndSelect(page, 'AI gated text');

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).not.toBeVisible();

    // Fire the model-changed event from within the page context.
    await page.evaluate(() => {
      const listeners = (window as any).__tauriListeners__?.['ai:model-changed'] as
        | ((e: unknown) => void)[]
        | undefined;
      if (listeners) {
        listeners.forEach((cb) => cb({ payload: { modelId: 'qwen2.5-0.5b' } }));
      }
    });
    await page.waitForTimeout(100);

    // Re-select now that AI is enabled: the selection handler ignores selection
    // changes while aiEnabled is false, so the pill only opens on a selection
    // that occurs after the model becomes available.
    const editor = new EditorPage(page);
    await editor.selectText('AI gated text');
    await page.waitForTimeout(150);

    await expect(page.locator('[data-testid="selection-ask-ai-pill"]')).toBeVisible();
  });

  test('pill closes on Escape', async ({ page }) => {
    await page.addInitScript(
      ({ k, s }) => {
        try {
          localStorage.setItem(s, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, s: DOCX_EDITOR_AI_KEY }
    );
    await loadEditor(page);

    await typeAndSelect(page, 'Escape test');

    const pill = page.locator('[data-testid="selection-ask-ai-pill"]');
    await expect(pill).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await expect(pill).not.toBeVisible();
  });
});

// ── DocOpsPanel streaming ─────────────────────────────────────────────────────

test.describe('DocOpsPanel SSE streaming', () => {
  test('shows setup view when no API key is stored', async ({ page }) => {
    // Enable DocOps feature flag but leave no API key.
    await page.addInitScript((panelKey) => {
      (window as any).__casualFeatures__ = { docops: true };
      try {
        localStorage.removeItem(panelKey);
      } catch {
        /* ignore */
      }
    }, DOCOPS_PANEL_KEY);
    await loadEditor(page);

    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) {
      test.skip(true, 'DocOps rail button not present');
      return;
    }
    await docopsBtn.click();

    await expect(page.locator('[data-testid="docops-key-setup"]')).toBeVisible();
  });

  test('in-flight streaming tokens commit to message on completion', async ({ page }) => {
    await page.addInitScript(
      ({ k, editorKey, panelKey }) => {
        (window as any).__casualFeatures__ = { docops: true };
        // editorKey enables aiEnabled in DocxEditor (gates the pill + DocOps button).
        // panelKey bypasses the key-setup screen inside DocOpsPanel itself.
        try {
          localStorage.setItem(editorKey, k);
        } catch {
          /* ignore */
        }
        try {
          localStorage.setItem(panelKey, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, editorKey: DOCX_EDITOR_AI_KEY, panelKey: DOCOPS_PANEL_KEY }
    );
    await loadEditor(page);

    // Intercept Anthropic fetch — return a minimal SSE stream.
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      const sseBody = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-haiku-4-5-20251001","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
        '',
      ].join('\n');

      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: sseBody,
      });
    });

    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) {
      test.skip(true, 'DocOps rail button not present');
      return;
    }
    await docopsBtn.click();

    await page.waitForSelector('[data-testid="docops-input"]', { timeout: 5000 });
    await page.locator('[data-testid="docops-input"]').fill('Say hello');
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="docops-messages"]')).toContainText('Hello world', {
      timeout: 8000,
    });
  });

  test('agent-mode toggle renders and flips Chat ↔ Agent', async ({ page }) => {
    await page.addInitScript(
      ({ k, editorKey, panelKey }) => {
        (window as any).__casualFeatures__ = { docops: true };
        try {
          localStorage.setItem(editorKey, k);
        } catch {
          /* ignore */
        }
        try {
          localStorage.setItem(panelKey, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, editorKey: DOCX_EDITOR_AI_KEY, panelKey: DOCOPS_PANEL_KEY }
    );
    await loadEditor(page);

    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) {
      test.skip(true, 'DocOps rail button not present');
      return;
    }
    await docopsBtn.click();
    await page.waitForSelector('[data-testid="docops-input"]', { timeout: 5000 });

    // DirectTransport does not drive its own loop, so the toggle is available
    // and defaults to Chat (single-shot).
    const toggle = page.locator('[data-testid="docops-agent-toggle"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(/Chat/);
    await toggle.click();
    await expect(toggle).toHaveText(/Agent/);
  });

  test('connects an external MCP server and shows its tool count', async ({ page }) => {
    await page.addInitScript(
      ({ k, editorKey, panelKey }) => {
        (window as any).__casualFeatures__ = { docops: true };
        try {
          localStorage.setItem(editorKey, k);
        } catch {
          /* ignore */
        }
        try {
          localStorage.setItem(panelKey, k);
        } catch {
          /* ignore */
        }
      },
      { k: FAKE_KEY, editorKey: DOCX_EDITOR_AI_KEY, panelKey: DOCOPS_PANEL_KEY }
    );

    // Mock a Streamable-HTTP MCP server: reply to initialize + tools/list.
    // On the web the panel routes MCP through the same-origin /api/mcp-proxy
    // (browsers can't reach external MCP servers — no CORS); the proxy request
    // wraps the JSON-RPC as { url, headers, body }. Unwrap it here.
    await page.route('**/api/mcp-proxy', async (route) => {
      const envelope = JSON.parse(route.request().postData() || '{}');
      const body = JSON.parse(envelope.body || '{}');
      if (body.id === undefined) {
        await route.fulfill({ status: 202, body: '' }); // notification
        return;
      }
      const result =
        body.method === 'initialize'
          ? {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'mock', version: '1' },
            }
          : body.method === 'tools/list'
            ? {
                tools: [
                  {
                    name: 'web_search',
                    description: 'Search',
                    inputSchema: { type: 'object', properties: {} },
                  },
                ],
              }
            : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      });
    });

    await loadEditor(page);

    const docopsBtn = page.locator('[data-testid="rail-docops"]');
    if (!(await docopsBtn.isVisible())) {
      test.skip(true, 'DocOps rail button not present');
      return;
    }
    await docopsBtn.click();
    await page.waitForSelector('[data-testid="docops-input"]', { timeout: 5000 });

    await page.locator('[data-testid="docops-agent-toggle"]').click();
    await page.locator('[data-testid="docops-mcp-add"]').click();
    await page.locator('[data-testid="docops-mcp-input"]').fill('http://localhost/mcp-test/rpc');
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-testid="docops-mcp-section"]')).toContainText('1 tools', {
      timeout: 8000,
    });
  });
});

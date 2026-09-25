/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MD_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.md');
const TXT_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.txt');
const YML_FIXTURE = path.join(__dirname, '..', 'fixtures', 'casual-sample.yml');
const NOTEBOOK_FIXTURE = path.join(__dirname, '..', 'fixtures', 'notebook-sample.md');

/**
 * Markdown / text editor opened from the Home picker.
 *
 * `.md` files are NOT flattened to DOCX — they open in a dedicated CodeMirror
 * source pane with a live HTML preview and three view modes (source / split /
 * preview), the same shape other markdown editors use. This drives the real
 * picker → editor, asserting:
 *   - raw markdown shows in the source pane (not rendered),
 *   - the preview renders HTML (h1 + bold),
 *   - all three view modes show/hide the right panes,
 *   - editing the source updates the preview live.
 */

async function openMarkdown(page: import('@playwright/test').Page) {
  await page.goto('/');
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.md/);
  await fileInput.setInputFiles(MD_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });
}

test('dark mode: source + preview text stays readable (no white-on-light)', async ({ page }) => {
  // A prior docx-editor mount sets data-theme="dark" on <html>; the markdown
  // editor must theme its panes consistently. Regression: the panes used the
  // always-light page-paper token while text used the theme-swapping text
  // token, producing white text on a near-white pane.
  await page.addInitScript(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.goto('/');
  await page.getByTestId('home-file-input').setInputFiles(MD_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  const lum = (rgb: string) => {
    const m = rgb.match(/\d+/g)!.map(Number);
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
  };
  const contrast = await page.evaluate(() => {
    const src = document.querySelector('[data-testid="markdown-source"] .cm-content')!;
    const pane = document.querySelector('[data-testid="markdown-source"] .cm-editor')!;
    return { text: getComputedStyle(src).color, bg: getComputedStyle(pane).backgroundColor };
  });
  // Text and pane luminance must differ enough to be readable.
  expect(Math.abs(lum(contrast.text) - lum(contrast.bg))).toBeGreaterThan(0.3);
});

test('dark mode: .yml syntax-highlight tokens stay readable', async ({ page }) => {
  // The default CodeMirror highlight style bakes in light-mode token colors
  // (dark-blue keys) that vanish on a dark pane. Our theme-adaptive style must
  // win over basicSetup's and swap colors under data-theme="dark".
  await page.addInitScript(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.goto('/');
  await page.getByTestId('home-file-input').setInputFiles(YML_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  const lum = (rgb: string) => {
    const m = rgb.match(/\d+/g)!.map(Number);
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
  };
  const c = await page.evaluate(() => {
    const lines = document.querySelectorAll('[data-testid="markdown-source"] .cm-line');
    const key = lines[1]?.querySelector('span'); // a YAML key token
    const pane = document.querySelector('[data-testid="markdown-source"] .cm-editor')!;
    return { key: key ? getComputedStyle(key).color : '', bg: getComputedStyle(pane).backgroundColor };
  });
  expect(Math.abs(lum(c.key) - lum(c.bg))).toBeGreaterThan(0.3);
});

test('opens .md in the source+preview editor with raw markdown and rendered preview', async ({
  page,
}) => {
  await openMarkdown(page);

  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Default mode for markdown is split — both panes visible.
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();

  // Source shows the RAW markdown syntax (the literal '#', '**').
  await expect(source).toContainText('# Markdown Fixture Title');
  await expect(source).toContainText('**bold text**');

  // Preview renders it to HTML — heading as <h1>, bold as <strong>.
  await expect(preview.locator('h1')).toHaveText('Markdown Fixture Title');
  await expect(preview.locator('strong')).toHaveText('bold text');
  await expect(preview.locator('li')).toHaveCount(2);

  await page.screenshot({ path: 'screenshots/markdown-split.png' });
});

test('view modes show and hide the correct panes', async ({ page }) => {
  await openMarkdown(page);
  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Source-only: editor visible, preview gone.
  await page.getByTestId('markdown-view-source').click();
  await expect(source).toBeVisible();
  await expect(preview).toHaveCount(0);

  // Preview-only: preview visible, source hidden.
  await page.getByTestId('markdown-view-preview').click();
  await expect(preview).toBeVisible();
  await expect(source).toBeHidden();

  // Back to split: both visible.
  await page.getByTestId('markdown-view-split').click();
  await expect(source).toBeVisible();
  await expect(preview).toBeVisible();
});

test('.txt opens as source-only — no preview pane or view toggle', async ({ page }) => {
  await page.goto('/');
  const fileInput = page.getByTestId('home-file-input');
  await expect(fileInput).toHaveAttribute('accept', /\.txt/);
  await fileInput.setInputFiles(TXT_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  // Plain text has no markdown semantics: source pane only, no preview,
  // and no source/split/preview toggle.
  await expect(page.getByTestId('markdown-source')).toContainText('No markdown preview here.');
  await expect(page.getByTestId('markdown-preview')).toHaveCount(0);
  await expect(page.getByTestId('markdown-view-split')).toHaveCount(0);
});

test('.yml opens as source-only with YAML syntax highlighting', async ({ page }) => {
  await page.goto('/');
  const fileInput = page.getByTestId('home-file-input');
  // Picker accepts config source files.
  await expect(fileInput).toHaveAttribute('accept', /\.yml/);
  await fileInput.setInputFiles(YML_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  const source = page.getByTestId('markdown-source');

  // Config files route to the source editor: source-only, no preview / toggle.
  await expect(source).toContainText('backend: local');
  await expect(page.getByTestId('markdown-preview')).toHaveCount(0);
  await expect(page.getByTestId('markdown-view-split')).toHaveCount(0);

  // CodeMirror applies YAML highlighting — highlighted tokens render as
  // <span> elements inside the lines (an unhighlighted blob has none).
  await expect(source.locator('.cm-line span').first()).toBeVisible();

  await page.screenshot({ path: 'screenshots/yaml-source.png' });
});

test('new-file picker offers Markdown and Text kinds', async ({ page }) => {
  await page.goto('/');

  // Creating a new file offers markdown / text, not only a Word doc.
  await expect(page.getByTestId('template-card-blank-markdown').first()).toBeVisible();
  await expect(page.getByTestId('template-card-blank-text').first()).toBeVisible();

  // Blank Markdown opens an empty .md in the source/markdown editor.
  await page.getByTestId('template-card-blank-markdown').first().click();
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });
  await expect(page.getByTestId('markdown-filename')).toHaveValue('Untitled.md');
  // Markdown kind → the notebook view toggle is present.
  await expect(page.getByTestId('markdown-view-notebook')).toBeVisible();
});

test('a .md opened from Home is recorded as a recent and reopens in the md editor', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('home-file-input').setInputFiles(MD_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });
  // Let the async recordRecentFile commit to IndexedDB.
  await page.waitForTimeout(600);

  // Reload Home — the file should appear in recents (read from IndexedDB).
  await page.goto('/');
  const recent = page.locator('[data-testid^="recent-card-"]').first();
  await expect(recent).toBeVisible({ timeout: 15000 });

  // Reopening it must land in the markdown editor (source/preview), NOT the
  // DOCX editor — the extension routes it back to the same surface.
  await recent.click();
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });
  await expect(page.getByTestId('markdown-view-notebook')).toBeVisible();
  await expect(page.locator('[data-testid="docx-editor"]')).toHaveCount(0);
});

test('Notebook mode renders markdown inline and reveals syntax on the caret', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-file-input').setInputFiles(NOTEBOOK_FIXTURE);
  await page.waitForSelector('[data-testid="markdown-editor"]', { timeout: 30000 });

  // Switch to the notebook (live-preview) mode.
  await page.getByTestId('markdown-view-notebook').click();
  const source = page.getByTestId('markdown-source');

  // Single surface — no separate preview pane.
  await expect(page.getByTestId('markdown-preview')).toHaveCount(0);

  // Move the caret off the heading (last paragraph) so its markers hide.
  await source.locator('.cm-line', { hasText: 'Plain paragraph' }).click();

  // Headings render enlarged (line decoration) and inline emphasis is styled.
  await expect(source.locator('.cm-md-h1').first()).toBeVisible();
  await expect(source.locator('.cm-md-strong').first()).toBeVisible();
  await expect(source.locator('.cm-md-em').first()).toBeVisible();
  await expect(source.locator('.cm-md-code').first()).toBeVisible();

  // GFM: strikethrough renders struck, and task-list markers become checkboxes
  // (one of them checked).
  await expect(source.locator('.cm-md-strike').first()).toBeVisible();
  await expect(source.locator('.cm-md-checkbox')).toHaveCount(2);
  await expect(source.locator('.cm-md-checkbox-done')).toHaveCount(1);

  // With the caret elsewhere, the H1 line's '#' marker is hidden (clean render).
  const h1 = source.locator('.cm-md-h1').first();
  await expect(h1).toContainText('Casual Notebook');
  await expect(h1).not.toContainText('#');

  // Clicking into the heading reveals the raw '#' so it can be edited
  // (Obsidian Live-Preview behavior).
  await h1.click();
  await expect(source.locator('.cm-line', { hasText: '# Casual Notebook' })).toBeVisible();

  await page.screenshot({ path: 'screenshots/md-notebook-test.png' });
});

test('editing the source updates the preview live', async ({ page }) => {
  await openMarkdown(page);
  const source = page.getByTestId('markdown-source');
  const preview = page.getByTestId('markdown-preview');

  // Put the caret at the very start of the document and type a new heading.
  const content = source.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('# Live Edit Heading\n\n');

  await expect(preview.locator('h1').first()).toHaveText('Live Edit Heading');
});

test('Download saves the edited source back to a .md file', async ({ page }) => {
  await openMarkdown(page);

  // Edit, then download — the saved file must reflect the live edit.
  const content = page.getByTestId('markdown-source').locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type('# Saved Heading\n\n');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('markdown-download').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('casual-sample.md');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const saved = Buffer.concat(chunks).toString('utf-8');
  expect(saved).toContain('# Saved Heading');
  expect(saved).toContain('# Markdown Fixture Title');
});

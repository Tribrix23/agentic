/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * DocsBridge — translates DocOps tool calls into ProseMirror operations.
 *
 * Every read tool walks the PM doc and returns JSON.
 * Every write tool dispatches a PM transaction (→ Yjs sync + undo).
 * The LLM never touches PM, OOXML, or Yjs directly.
 */

import type { EditorView } from 'prosemirror-view';
import { collectHeadings } from '@eigenpal/docx-core/utils';
import { generateTOC } from '@eigenpal/docx-core/prosemirror/commands';
import { convertSelectionToTable } from '../utils/convertTextToTable';
import {
  retrieve,
  WorkspaceIndex,
  type DocOpsResult,
  type RetrievalChunk,
  type WorkspaceDoc,
} from '@casualoffice/docops';
import { getSharedWorkspace } from './workspaceStore';

/**
 * Subset of DocxEditorRef exposed to the bridge for mutation operations.
 * Structurally compatible with DocxEditorRef so no cast is needed.
 */
export interface DocsBridgeActions {
  proposeChange(options: {
    paraId: string;
    search: string;
    replaceWith: string;
    author: string;
  }): boolean;
  setParagraphStyle(options: { paraId: string; styleId: string }): boolean;
  addComment(options: {
    paraId: string;
    text: string;
    author: string;
    search?: string;
  }): number | null;
  rewriteSelection(options: { newText: string; author: string }): boolean;
  deleteParagraphs(options: { paraIds: string[]; author: string }): boolean;
  insertParagraphAfter(options: {
    paraId: string;
    text: string;
    styleId?: string;
    author: string;
  }): boolean;
  harmonizeStyles(options: {
    headingRemap?: Record<string, string>;
    unifyFont?: string;
  }): { changed: number; summary: string[] } | null;
  insertReportFromData(options: {
    title: string;
    columns: string[];
    rows: string[][];
    afterParaId?: string;
  }): boolean;
  createDocument(options: {
    title: string;
    sections: Array<{ heading: string; level?: number; paragraphs?: string[] }>;
  }): boolean;
}

export class DocsBridge {
  // On-device workspace RAG (north-star O2): the host (desktop shell) extracts
  // plain text from the user's local files and pushes it here via
  // setWorkspaceDocs; search_workspace then retrieves across all of them. Null
  // until a workspace is provided, so search_workspace degrades gracefully.
  private workspace: WorkspaceIndex | null = null;

  // Display name of the human who triggered the current AI action. Used to
  // attribute AI-authored mutations (tracked changes, comments) so co-editors
  // can tell who ran the AI — e.g. "Alice via AI" instead of an anonymous bot.
  private aiUser: string | null = null;

  constructor(
    private readonly getView: () => EditorView | null,
    private readonly getActions: () => DocsBridgeActions | null = () => null
  ) {}

  /** Set the human whose AI actions are attributed (host-driven; see aiUser). */
  setAiAuthor(user: string | null): void {
    this.aiUser = user && user.trim() ? user.trim() : null;
  }

  /** Author label for AI-triggered mutations: "<user> via AI", or "AI" when unknown. */
  private aiAuthor(): string {
    return this.aiUser ? `${this.aiUser} via AI` : 'AI';
  }

  /** Replace the indexed workspace (host-driven; files stay on the machine). */
  setWorkspaceDocs(docs: WorkspaceDoc[]): void {
    const idx = new WorkspaceIndex();
    for (const doc of docs) idx.add(doc);
    this.workspace = idx;
  }

  /** True when a local workspace has been indexed (gates the search_workspace tool). */
  hasWorkspace(): boolean {
    return (!!this.workspace && this.workspace.size > 0) || !!getSharedWorkspace();
  }

  clearWorkspace(): void {
    this.workspace = null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<DocOpsResult> {
    switch (name) {
      case 'get_outline':
        return this.getOutline(args);
      case 'get_selection':
        return this.getSelection();
      case 'get_doc_stats':
        return this.getDocStats();
      case 'search_document':
        return this.searchDocument(args);
      case 'search_workspace':
        return this.searchWorkspace(args);
      case 'list_styles':
        return this.listStyles();
      case 'find_text':
        return this.findText(args);
      case 'convert_range_to_table':
        return this.convertRangeToTable();
      case 'insert_toc':
        return this.insertToc();
      case 'suggest_text_change':
        return this.suggestTextChange(args);
      case 'set_paragraph_style':
        return this.setParagraphStyle(args);
      case 'add_comment':
        return this.addComment(args);
      case 'get_block':
        return this.getBlock(args);
      case 'harmonize_styles':
        return this.harmonizeStyles(args);
      case 'rewrite_selection':
        return this.rewriteSelection(args);
      case 'delete_paragraphs':
        return this.deleteParagraphs(args);
      case 'insert_paragraph_after':
        return this.insertParagraphAfter(args);
      case 'insert_report_from_data':
        return this.insertReportFromData(args);
      case 'create_document':
        return this.createDocument(args);
      default:
        return {
          ok: false,
          code: 'UNSUPPORTED',
          message: `Unknown tool: ${name}`,
          retryable: false,
        };
    }
  }

  private noView(): DocOpsResult {
    return {
      ok: false,
      code: 'LOCATOR_NOT_FOUND',
      message: 'No active editor view.',
      retryable: true,
    };
  }

  private getOutline(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : 6;
    const headings = collectHeadings(view.state.doc);
    const filtered = headings.filter((h) => h.level < maxDepth);

    const items = filtered.map((h) => {
      const node = view.state.doc.nodeAt(h.pmPos);
      const blockId = (node?.attrs.paraId as string | undefined) ?? null;
      return { text: h.text, level: h.level + 1, blockId };
    });

    return { ok: true, data: { items, count: items.length } };
  }

  private getSelection(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const { from, to, empty } = view.state.selection;
    if (empty) return { ok: true, data: { hasSelection: false } };

    const text = view.state.doc.textBetween(from, to, '\n', ' ');
    const blockIds: string[] = [];

    view.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'paragraph') {
        const paraId = node.attrs.paraId as string | undefined;
        if (paraId && !blockIds.includes(paraId)) blockIds.push(paraId);
      }
    });

    return {
      ok: true,
      data: { hasSelection: true, text, blockIds, charCount: to - from },
    };
  }

  private getDocStats(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    let wordCount = 0;
    let paragraphCount = 0;
    let tableCount = 0;
    let imageCount = 0;
    const headingLevelSet = new Set<number>();
    // Collect the document's plain text so the model can actually read it —
    // without this, get_doc_stats returns only counts and the model has no
    // content to summarize / answer questions about (it hallucinates).
    const textParts: string[] = [];

    view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        paragraphCount++;
        let text = '';
        node.forEach((child) => {
          if (child.isText) text += child.text ?? '';
        });
        if (text.trim()) {
          wordCount += text.trim().split(/\s+/).length;
          textParts.push(text);
        }

        const level = node.attrs.outlineLevel as number | null;
        const styleId = node.attrs.styleId as string | null;
        let effectiveLevel = level;
        if (effectiveLevel == null && styleId) {
          const m = styleId.match(/^[Hh]eading(\d)$/);
          if (m) effectiveLevel = parseInt(m[1], 10) - 1;
        }
        if (effectiveLevel != null) headingLevelSet.add(effectiveLevel);
      } else if (node.type.name === 'table') {
        tableCount++;
      } else if (node.type.name === 'image') {
        imageCount++;
      }
    });

    // Do NOT dump the whole document here — that overflowed the local model's
    // 8k-token context (TOO_LARGE) and silently truncated long docs. Return a
    // short preview for orientation; the model reads real content via
    // search_document (relevant passages) or get_block (a specific block).
    const PREVIEW_CHARS = 1200;
    const fullText = textParts.join('\n');
    const preview =
      fullText.length > PREVIEW_CHARS ? fullText.slice(0, PREVIEW_CHARS) + '…' : fullText;

    return {
      ok: true,
      data: {
        wordCount,
        paragraphCount,
        tableCount,
        imageCount,
        headingLevels: Array.from(headingLevelSet)
          .sort()
          .map((l) => l + 1),
        preview,
        note: 'preview is only the first ~1200 chars. To summarize or answer questions, call search_document(query) to retrieve the relevant passages.',
      },
    };
  }

  /**
   * RAG: chunk the document by heading section and return the passages most
   * relevant to `query` (BM25), each with its blockIds so the agent can edit
   * the retrieved text. Replaces dumping the whole document into the prompt.
   */
  private searchDocument(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { ok: false, code: 'VALIDATION', message: 'query is required.', retryable: false };
    }
    const k = typeof args.k === 'number' ? Math.min(Math.max(Math.floor(args.k), 1), 8) : 5;

    const CHUNK_CHARS = 1800;
    const chunks: RetrievalChunk[] = [];
    const headingStack: { level: number; text: string }[] = [];
    let seq = 0;
    let headingPath: string[] = [];
    let blockIds: string[] = [];
    let parts: string[] = [];

    const flush = () => {
      const body = parts.join('\n').trim();
      if (body) {
        const prefix = headingPath.length ? headingPath.join(' › ') + '\n' : '';
        chunks.push({
          id: `dc${seq++}`,
          text: prefix + body,
          meta: { blockIds: [...blockIds], headingPath: [...headingPath] },
        });
      }
      blockIds = [];
      parts = [];
    };

    view.state.doc.descendants((node) => {
      if (node.type.name !== 'paragraph') return;
      const paraId = node.attrs.paraId as string | undefined;
      let text = '';
      node.forEach((child) => {
        if (child.isText) text += child.text ?? '';
      });

      const level = node.attrs.outlineLevel as number | null;
      const styleId = node.attrs.styleId as string | null;
      let effLevel = level;
      if (effLevel == null && styleId) {
        const m = styleId.match(/^[Hh]eading(\d)$/);
        if (m) effLevel = parseInt(m[1], 10) - 1;
      }

      if (effLevel != null) {
        // New section — close the previous chunk and reset the heading path.
        flush();
        while (headingStack.length && headingStack[headingStack.length - 1].level >= effLevel) {
          headingStack.pop();
        }
        headingStack.push({ level: effLevel, text: text.trim() });
        headingPath = headingStack.map((h) => h.text).filter(Boolean);
        if (paraId) blockIds.push(paraId);
      } else {
        if (paraId) blockIds.push(paraId);
        if (text.trim()) parts.push(text);
        if (parts.join('\n').length > CHUNK_CHARS) flush();
      }
    });
    flush();

    const result = retrieve(chunks, query, { k });
    return {
      ok: true,
      data: {
        chunks: result.chunks.map((c) => ({
          chunkId: c.id,
          headingPath: (c.meta as { headingPath?: string[] })?.headingPath ?? [],
          blockIds: (c.meta as { blockIds?: string[] })?.blockIds ?? [],
          snippet: c.text.slice(0, 700),
          score: Math.round(c.score * 100) / 100,
        })),
        count: result.chunks.length,
        truncated: result.truncated,
        note: result.chunks.length
          ? 'These are the passages most relevant to the query. Edit via the blockIds.'
          : 'No passages matched the query.',
      },
    };
  }

  /**
   * RAG across the user's LOCAL workspace (other files in the folder), not just
   * the open document — the on-device answer to cloud workspace search. Returns
   * the best passages with the source file for each, so the model can cite them.
   */
  private searchWorkspace(args: Record<string, unknown>): DocOpsResult {
    // Prefer a workspace set directly on this bridge; otherwise use the shared
    // process-level workspace the host populates (embed command / desktop).
    const ws = this.workspace && this.workspace.size > 0 ? this.workspace : getSharedWorkspace();
    if (!ws) {
      return {
        ok: false,
        code: 'UNSUPPORTED',
        message: 'No workspace folder is indexed. Ask the user to open a folder first.',
        retryable: false,
      };
    }
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { ok: false, code: 'VALIDATION', message: 'query is required.', retryable: false };
    }
    const k = typeof args.k === 'number' ? Math.min(Math.max(Math.floor(args.k), 1), 8) : 6;
    const result = ws.search(query, k);
    return {
      ok: true,
      data: {
        hits: result.hits.map((h) => ({
          source: h.docName,
          snippet: h.snippet,
          score: h.score,
        })),
        sources: result.sources.map((s) => s.docName),
        count: result.hits.length,
        truncated: result.truncated,
        note: result.hits.length
          ? 'Passages from across the workspace. Cite the source file for each claim.'
          : 'No passages in the workspace matched the query.',
      },
    };
  }

  private listStyles(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const styleIds = new Map<string, number>();
    const fonts = new Map<string, number>();

    view.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        const styleId = node.attrs.styleId as string | null;
        if (styleId) styleIds.set(styleId, (styleIds.get(styleId) ?? 0) + 1);

        node.forEach((child) => {
          if (child.isText) {
            child.marks.forEach((mark) => {
              if (mark.type.name === 'font') {
                const family = mark.attrs.fontFamily as string | null;
                if (family) fonts.set(family, (fonts.get(family) ?? 0) + 1);
              }
            });
          }
        });
      }
    });

    return {
      ok: true,
      data: {
        styles: Array.from(styleIds.entries())
          .map(([id, count]) => ({ id, count }))
          .sort((a, b) => b.count - a.count),
        fonts: Array.from(fonts.entries())
          .map(([family, count]) => ({ family, count }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }

  private findText(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const query = String(args.query ?? '').toLowerCase();
    if (!query) {
      return { ok: false, code: 'VALIDATION', message: 'query is required.', retryable: false };
    }
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 50) : 10;

    const matches: Array<{ blockId: string | null; snippet: string; pmPos: number }> = [];

    view.state.doc.descendants((node, pos) => {
      if (matches.length >= limit) return false;
      // Match any textblock (paragraphs, headings, list items, …) so find_text
      // is consistent with get_block, which also keys on isTextblock. The old
      // paragraph-only check silently missed text in other block types.
      if (!node.isTextblock) return;

      let text = '';
      node.forEach((child) => {
        if (child.isText) text += child.text ?? '';
      });

      if (!text.toLowerCase().includes(query)) return;

      const paraId = (node.attrs.paraId as string | undefined) ?? null;
      const idx = text.toLowerCase().indexOf(query);
      const start = Math.max(0, idx - 40);
      const end = Math.min(text.length, idx + query.length + 40);
      const snippet =
        (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');

      matches.push({ blockId: paraId, snippet, pmPos: pos });
    });

    return { ok: true, data: { matches, count: matches.length } };
  }

  private convertRangeToTable(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const success = convertSelectionToTable(view);
    if (!success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message:
          'No suitable selection. Select paragraphs with tab- or comma-delimited content first.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: 'Converted selection to table.' };
  }

  private insertToc(): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const success = generateTOC(view.state, view.dispatch);
    if (!success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message:
          'Could not insert TOC. Make sure the document has headings and the cursor is placed.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: 'Inserted table of contents.' };
  }

  private noActions(): DocOpsResult {
    return {
      ok: false,
      code: 'UNSUPPORTED',
      message: 'Mutation tools are not available yet — the editor is still initialising.',
      retryable: true,
    };
  }

  private suggestTextChange(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const paraId = String(args.paraId ?? '');
    const search = String(args.search ?? '');
    const replaceWith = String(args.replaceWith ?? '');

    if (!paraId) {
      return { ok: false, code: 'VALIDATION', message: 'paraId is required.', retryable: false };
    }

    const success = actions.proposeChange({ paraId, search, replaceWith, author: this.aiAuthor() });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message:
          'Could not apply change. Check that paraId is correct, the search text exists in that paragraph, and there are no overlapping tracked changes.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: `Suggested change in paragraph ${paraId}.` };
  }

  private setParagraphStyle(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const paraId = String(args.paraId ?? '');
    const styleId = String(args.styleId ?? '');

    if (!paraId || !styleId) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'paraId and styleId are required.',
        retryable: false,
      };
    }

    const success = actions.setParagraphStyle({ paraId, styleId });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message: `Could not apply style '${styleId}'. Check that paraId is correct and the style exists in this document.`,
        retryable: false,
      };
    }
    return { ok: true, diffSummary: `Applied style '${styleId}' to paragraph ${paraId}.` };
  }

  private addComment(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const paraId = String(args.paraId ?? '');
    const text = String(args.text ?? '');
    const search = args.search != null ? String(args.search) : undefined;

    if (!paraId || !text) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'paraId and text are required.',
        retryable: false,
      };
    }

    const commentId = actions.addComment({ paraId, text, author: this.aiAuthor(), search });
    if (commentId == null) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message:
          'Could not add comment. Check that paraId is correct and the search phrase (if given) exists in the paragraph.',
        retryable: false,
      };
    }
    return { ok: true, data: { commentId }, diffSummary: `Added comment to paragraph ${paraId}.` };
  }

  private getBlock(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();

    const blockId = String(args.blockId ?? '');
    if (!blockId) {
      return { ok: false, code: 'VALIDATION', message: 'blockId is required.', retryable: false };
    }

    type Run = {
      text: string;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontFamily?: string;
      fontSize?: number;
    };
    type BlockData = {
      blockId: string;
      type: string;
      text: string;
      attrs: Record<string, unknown>;
      runs: Run[];
    };

    let found: BlockData | null = null;

    view.state.doc.descendants((node) => {
      if (found) return false;
      if (!node.isTextblock || node.attrs?.paraId !== blockId) return true;

      let text = '';
      const runs: Run[] = [];

      node.forEach((child) => {
        if (!child.isText) return;
        const t = child.text ?? '';
        text += t;
        const run: Run = { text: t };
        for (const mark of child.marks) {
          if (mark.type.name === 'bold') run.bold = true;
          if (mark.type.name === 'italic') run.italic = true;
          if (mark.type.name === 'underline') run.underline = true;
          if (mark.type.name === 'font') run.fontFamily = mark.attrs.fontFamily as string;
          if (mark.type.name === 'fontSize') run.fontSize = mark.attrs.fontSize as number;
        }
        runs.push(run);
      });

      found = {
        blockId,
        type: node.type.name,
        text,
        attrs: {
          styleId: (node.attrs.styleId as string | null) ?? null,
          outlineLevel: (node.attrs.outlineLevel as number | null) ?? null,
          alignment: (node.attrs.alignment as string | null) ?? null,
        },
        runs,
      };
      return false;
    });

    if (!found) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message: `Block ${blockId} not found.`,
        retryable: false,
      };
    }
    return { ok: true, data: found };
  }

  private harmonizeStyles(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const headingRemap =
      args.headingRemap &&
      typeof args.headingRemap === 'object' &&
      !Array.isArray(args.headingRemap)
        ? (args.headingRemap as Record<string, string>)
        : undefined;
    const unifyFont = args.unifyFont != null ? String(args.unifyFont) : undefined;

    if (!headingRemap && !unifyFont) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'Provide at least one of: headingRemap, unifyFont.',
        retryable: false,
      };
    }

    const result = actions.harmonizeStyles({ headingRemap, unifyFont });
    if (!result) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message: 'Could not apply harmonization — editor is not ready.',
        retryable: true,
      };
    }
    return {
      ok: true,
      data: result,
      diffSummary: result.summary.join('; ') || 'No changes needed.',
    };
  }

  private rewriteSelection(args: Record<string, unknown>): DocOpsResult {
    const view = this.getView();
    if (!view) return this.noView();
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const newText = String(args.new_text ?? '');
    if (!newText.trim()) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'new_text is required.',
        retryable: false,
      };
    }

    const { empty } = view.state.selection;
    if (empty) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'No selection active. Call get_selection first to confirm a selection exists.',
        retryable: false,
      };
    }

    const success = actions.rewriteSelection({ newText, author: this.aiAuthor() });
    if (!success) {
      return {
        ok: false,
        code: 'VALIDATION',
        message:
          'Could not rewrite selection. The selection may overlap an existing tracked change.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: 'Rewrote selection as tracked change.' };
  }

  private deleteParagraphs(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const paraIds = Array.isArray(args.paraIds)
      ? (args.paraIds as unknown[]).filter((x) => typeof x === 'string').map(String)
      : [];

    if (!paraIds.length) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'paraIds must be a non-empty array.',
        retryable: false,
      };
    }

    const success = actions.deleteParagraphs({ paraIds, author: this.aiAuthor() });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message:
          'Could not mark paragraphs for deletion. Check that all paraIds are valid and no paragraph already has a tracked change.',
        retryable: false,
      };
    }
    return {
      ok: true,
      diffSummary: `Marked ${paraIds.length} paragraph(s) for deletion.`,
    };
  }

  private insertParagraphAfter(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const paraId = String(args.paraId ?? '');
    const text = String(args.text ?? '');
    const styleId = args.styleId != null ? String(args.styleId) : undefined;

    if (!paraId || !text.trim()) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'paraId and text are required.',
        retryable: false,
      };
    }

    const success = actions.insertParagraphAfter({
      paraId,
      text,
      styleId,
      author: this.aiAuthor(),
    });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message:
          'Could not insert paragraph. Check that paraId is valid and styleId (if given) exists in this document.',
        retryable: false,
      };
    }
    return { ok: true, diffSummary: `Inserted new paragraph after ${paraId}.` };
  }

  private insertReportFromData(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const title = String(args.title ?? '');
    const columns = Array.isArray(args.columns)
      ? (args.columns as unknown[]).filter((x) => typeof x === 'string').map(String)
      : [];
    const rows = Array.isArray(args.rows)
      ? (args.rows as unknown[])
          .filter(Array.isArray)
          .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
      : [];
    const afterParaId = args.afterParaId != null ? String(args.afterParaId) : undefined;

    if (!title.trim()) {
      return { ok: false, code: 'VALIDATION', message: 'title is required.', retryable: false };
    }
    if (columns.length === 0) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'columns must be a non-empty array.',
        retryable: false,
      };
    }
    if (rows.length === 0) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'rows must be a non-empty array.',
        retryable: false,
      };
    }

    const success = actions.insertReportFromData({ title, columns, rows, afterParaId });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message: 'Could not insert report. Check that afterParaId (if given) is a valid block ID.',
        retryable: false,
      };
    }
    return {
      ok: true,
      diffSummary: `Inserted report "${title}" with ${columns.length} columns and ${rows.length} rows.`,
    };
  }

  private createDocument(args: Record<string, unknown>): DocOpsResult {
    const actions = this.getActions();
    if (!actions) return this.noActions();

    const title = String(args.title ?? '');

    type SectionInput = { heading?: unknown; level?: unknown; paragraphs?: unknown };
    const sections = Array.isArray(args.sections)
      ? (args.sections as SectionInput[]).map((s) => ({
          heading: String(s.heading ?? ''),
          level: typeof s.level === 'number' ? Math.max(2, Math.min(6, s.level)) : 2,
          paragraphs: Array.isArray(s.paragraphs)
            ? (s.paragraphs as unknown[]).map((p) => String(p))
            : [],
        }))
      : [];

    if (!title.trim()) {
      return { ok: false, code: 'VALIDATION', message: 'title is required.', retryable: false };
    }
    if (sections.length === 0) {
      return {
        ok: false,
        code: 'VALIDATION',
        message: 'sections must be a non-empty array.',
        retryable: false,
      };
    }

    const success = actions.createDocument({ title, sections });
    if (!success) {
      return {
        ok: false,
        code: 'LOCATOR_NOT_FOUND',
        message: 'Could not create document — editor is not ready.',
        retryable: true,
      };
    }
    return {
      ok: true,
      diffSummary: `Created document "${title}" with ${sections.length} section(s).`,
    };
  }
}

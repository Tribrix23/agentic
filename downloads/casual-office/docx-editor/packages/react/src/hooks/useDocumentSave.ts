/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useDocumentSave — the document SAVE path extracted from the DocxEditor
 * god-component (Spec #6, the crown-jewel slice). This is the most load-bearing
 * IO code: a bug here is data loss, so the extraction is a VERBATIM move with
 * the identical dependency array `[onSave, emitError, emitEvent, comments]`,
 * which preserves the invariants exactly:
 *
 *  - `comments` stays a BY-VALUE dependency (a stale snapshot would drop new
 *    comments/replies from the saved bytes).
 *  - the refs (agentRef / pagedEditorRef / footnote/endnote/props edits) are
 *    passed by reference and read as `.current` at save time — never snapshotted
 *    into the closure (footnote/endnote/prop edits arrive after render).
 *  - the mutation ORDER is unchanged: content → comments → footnotes → endnotes
 *    → properties → reply markers → selective options → toBuffer → selective
 *    clearTrackedChanges → onSave → emitEvent.
 *
 * Guarded by: the handleSave characterization e2e (tracked-change save→reload),
 * footnote/endnote-edit e2e, the ParagraphChangeTracker unit tests, and the
 * 39-fixture round-trip gate.
 */

import { useCallback, type MutableRefObject, type RefObject } from 'react';
import { setFootnotePlainText, setEndnotePlainText } from '@eigenpal/docx-core/docx';
import {
  getChangedParagraphIds,
  hasStructuralChanges,
  hasUntrackedChanges,
  hasNonParagraphBlockChanges,
  clearTrackedChanges,
  paraIdsSafeToClear,
} from '@eigenpal/docx-core/prosemirror/extensions';
import type { DocumentAgent } from '@eigenpal/docx-core/agent';
import type { Comment, BlockContent, ParagraphContent } from '@eigenpal/docx-core/types/content';
import type { PagedEditorRef } from '../paged-editor/PagedEditor';

/**
 * Inject commentRangeStart/End/Reference for reply comments.
 * Replies share the parent comment's text range in document.xml.
 * Without these markers, Pages/Word can't find the reply.
 */
function injectReplyRangeMarkers(content: BlockContent[], comments: Comment[]): void {
  const replies = comments.filter((c) => c.parentId != null);
  if (replies.length === 0) return;

  // Build parentId → reply IDs map
  const replyIdsByParent = new Map<number, number[]>();
  for (const r of replies) {
    const arr = replyIdsByParent.get(r.parentId!);
    if (arr) arr.push(r.id);
    else replyIdsByParent.set(r.parentId!, [r.id]);
  }

  // Walk document content and find parent commentRangeStart/End locations
  function walkBlocks(blocks: BlockContent[]): void {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        // Skip paragraphs without any comment range markers
        if (
          !block.content.some((i) => i.type === 'commentRangeStart' || i.type === 'commentRangeEnd')
        )
          continue;
        const newItems: ParagraphContent[] = [];
        for (const item of block.content) {
          if (item.type === 'commentRangeStart') {
            newItems.push(item);
            // Add reply range starts right after parent's start
            const replyIds = replyIdsByParent.get(item.id);
            if (replyIds) {
              for (const rid of replyIds) {
                newItems.push({ type: 'commentRangeStart', id: rid });
              }
            }
          } else if (item.type === 'commentRangeEnd') {
            // Parent's rangeEnd first, then reply rangeEnds (parallel, not nested)
            newItems.push(item);
            const replyIds = replyIdsByParent.get(item.id);
            if (replyIds) {
              for (const rid of replyIds) {
                newItems.push({ type: 'commentRangeEnd', id: rid });
              }
            }
          } else {
            newItems.push(item);
          }
        }
        block.content = newItems;
      } else if (block.type === 'table') {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            walkBlocks(cell.content);
          }
        }
      }
    }
  }

  walkBlocks(content);
}

/**
 * Inject commentRangeStart/End for comments that reply to tracked changes.
 * TC replies' parents are insertion/deletion nodes (not comments), so
 * injectReplyRangeMarkers can't find them. This function finds the TC
 * content nodes and wraps them with comment range markers.
 */
function injectTCReplyRangeMarkers(content: BlockContent[], comments: Comment[]): void {
  // Find replies whose parentId is a tracked change (not a real comment)
  const commentIds = new Set(comments.map((c) => c.id));
  const tcReplies = comments.filter((c) => c.parentId != null && !commentIds.has(c.parentId));
  if (tcReplies.length === 0) return;

  // Build revisionId → reply comment IDs
  const replyIdsByRevision = new Map<number, number[]>();
  for (const r of tcReplies) {
    const arr = replyIdsByRevision.get(r.parentId!);
    if (arr) arr.push(r.id);
    else replyIdsByRevision.set(r.parentId!, [r.id]);
  }

  function walkBlocks(blocks: BlockContent[]): void {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        // Check if any insertion/deletion in this paragraph matches a TC reply
        const hasTC = block.content.some(
          (item) =>
            (item.type === 'insertion' || item.type === 'deletion') &&
            replyIdsByRevision.has(item.info.id)
        );
        if (!hasTC) continue;

        const newItems: ParagraphContent[] = [];
        const items = block.content;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (
            (item.type === 'insertion' || item.type === 'deletion') &&
            replyIdsByRevision.has(item.info.id)
          ) {
            const replyIds = replyIdsByRevision.get(item.info.id)!;
            // Add commentRangeStart BEFORE the TC content
            for (const rid of replyIds) {
              newItems.push({ type: 'commentRangeStart', id: rid });
            }
            newItems.push(item);
            // Check if the next item is the other half of a replacement pair
            // (adjacent del+ins with same author+date). If so, include it inside
            // the comment range so we don't break del-ins adjacency.
            const next = items[i + 1];
            if (
              next &&
              (next.type === 'insertion' || next.type === 'deletion') &&
              next.type !== item.type &&
              next.info.author === item.info.author &&
              next.info.date === item.info.date
            ) {
              newItems.push(next);
              i++; // skip the paired item
            }
            // Add commentRangeEnd AFTER both TC items
            for (const rid of replyIds) {
              newItems.push({ type: 'commentRangeEnd', id: rid });
            }
          } else {
            newItems.push(item);
          }
        }
        block.content = newItems;
      } else if (block.type === 'table') {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            walkBlocks(cell.content);
          }
        }
      }
    }
  }

  walkBlocks(content);
}

export interface UseDocumentSaveOptions {
  agentRef: MutableRefObject<DocumentAgent | null>;
  pagedEditorRef: RefObject<PagedEditorRef | null>;
  /** By-VALUE — a stale snapshot would drop new comments/replies on save. */
  comments: Comment[];
  footnoteEditsRef: MutableRefObject<Map<number, string>>;
  endnoteEditsRef: MutableRefObject<Map<number, string>>;
  propsEditsRef: MutableRefObject<Record<string, string>>;
  onSave?: (buffer: ArrayBuffer) => void;
  emitEvent: (name: 'save', arg: ArrayBuffer) => void;
  emitError: (err: Error) => void;
}

export interface UseDocumentSaveReturn {
  handleSave: (options?: { selective?: boolean }) => Promise<ArrayBuffer | null>;
}

export function useDocumentSave(opts: UseDocumentSaveOptions): UseDocumentSaveReturn {
  const {
    agentRef,
    pagedEditorRef,
    comments,
    footnoteEditsRef,
    endnoteEditsRef,
    propsEditsRef,
    onSave,
    emitEvent,
    emitError,
  } = opts;

  const handleSave = useCallback(
    async (options?: { selective?: boolean }): Promise<ArrayBuffer | null> => {
      if (!agentRef.current) return null;

      try {
        const agentDoc = agentRef.current.getDocument();

        // Get the document from the PM editor state — this runs fromProseDoc which
        // converts PM comment marks into commentRangeStart/End in the document body.
        // The agent's internal document has the original parsed content and won't
        // include markers for newly added comments.
        const pmDoc = pagedEditorRef.current?.getDocument();
        if (pmDoc?.package?.document) {
          agentDoc.package.document.content = pmDoc.package.document.content;
        }

        // Sync React comments state (including new replies) back to the document model
        agentDoc.package.document.comments = comments;

        // Apply pending footnote text edits to the save document so they persist
        // (the surgical footnotes.xml regeneration in rezip keys off `edited`).
        if (footnoteEditsRef.current.size > 0 && agentDoc.package.footnotes) {
          for (const [id, text] of footnoteEditsRef.current) {
            const fn = agentDoc.package.footnotes.find((f) => f.id === id);
            if (fn) {
              setFootnotePlainText(fn, text);
              fn.edited = true;
            }
          }
        }
        if (endnoteEditsRef.current.size > 0 && agentDoc.package.endnotes) {
          for (const [id, text] of endnoteEditsRef.current) {
            const en = agentDoc.package.endnotes.find((e) => e.id === id);
            if (en) {
              setEndnotePlainText(en, text);
              en.edited = true;
            }
          }
        }
        // Apply pending core-property edits to the save doc (collab peers may
        // have set these via the observer; ensure the saver writes them).
        if (Object.keys(propsEditsRef.current).length > 0) {
          agentDoc.package.properties = {
            ...(agentDoc.package.properties ?? {}),
            ...propsEditsRef.current,
          };
        }

        // Inject commentRangeStart/End for reply comments that share the parent's range.
        // Pages/Word require every comment (including replies) to have range markers in document.xml.
        injectReplyRangeMarkers(agentDoc.package.document.content, comments);
        // Also inject range markers for comments that reply to tracked changes.
        injectTCReplyRangeMarkers(agentDoc.package.document.content, comments);

        // Build selective save options from change tracker state
        const useSelective = options?.selective !== false;
        const view = pagedEditorRef.current?.getView();
        let selectiveOptions: Parameters<typeof agentRef.current.toBuffer>[0] = undefined;

        if (useSelective && view) {
          const editorState = view.state;
          // Force full repack if any reply comments exist (both comment replies and
          // tracked-change replies need range markers injected into document.xml,
          // which selective save can't handle since the affected paragraphs may not
          // be in changedParaIds)
          const hasInjectedReplies = comments.some((c) => c.parentId != null);
          // Non-paragraph block changes (textBox / image / shape / table)
          // bypass the paraId-keyed selective path entirely — the
          // changed paraId set is empty for a drawing-only transaction
          // and the round-trip would silently drop the new node. Treat
          // them as untracked so the serializer falls back to a full
          // re-pack. See ParagraphChangeTrackerExtension for the source
          // of this signal.
          selectiveOptions = {
            selective: {
              changedParaIds: getChangedParagraphIds(editorState),
              structuralChange: hasStructuralChanges(editorState) || hasInjectedReplies,
              hasUntrackedChanges:
                hasUntrackedChanges(editorState) ||
                hasNonParagraphBlockChanges(editorState) ||
                // Footnote/endnote edits live outside the PM doc (in
                // footnotes.xml/endnotes.xml), so the paraId-keyed selective path
                // can't see them — force a full repack so the override runs.
                footnoteEditsRef.current.size > 0 ||
                endnoteEditsRef.current.size > 0 ||
                Object.keys(propsEditsRef.current).length > 0,
            },
          };
        }

        // A selective save serialized ONLY these paragraph ids (captured at t0,
        // before the async serialize below). We clear exactly them afterwards so
        // that edits — local keystrokes OR remote collab transactions — that land
        // on other paragraphs DURING the serialize keep their tracker entries and
        // get re-serialized next save. A blanket clear dropped them permanently
        // (not in the saved bytes, yet no longer tracked). Only safe when the save
        // took the selective path: a full repack forces the plain 'clear' so its
        // structural/untracked flags reset as before.
        const selective = selectiveOptions?.selective;
        const servedParaIds =
          selective && !selective.structuralChange && !selective.hasUntrackedChanges
            ? selective.changedParaIds
            : undefined;

        // Snapshot the doc we're about to serialize. If an edit lands during the
        // async serialize below, `view.state.doc` will differ afterwards.
        const servedDoc = view?.state.doc;
        const buffer = await agentRef.current.toBuffer(selectiveOptions);

        // Clear change tracker after successful save. If a served paragraph was
        // re-edited during the serialize window, don't clear it — that edit
        // isn't in the saved bytes, and a selective save only re-serializes
        // still-tracked paragraphs, so clearing would drop it silently.
        if (view) {
          const clearIds =
            servedParaIds && servedDoc && view.state.doc !== servedDoc
              ? paraIdsSafeToClear(servedDoc, view.state.doc, servedParaIds)
              : servedParaIds;
          view.dispatch(clearTrackedChanges(view.state, clearIds));
        }

        onSave?.(buffer);
        emitEvent('save', buffer);
        return buffer;
      } catch (error) {
        emitError(error instanceof Error ? error : new Error('Failed to save document'));
        return null;
      }
    },
    [onSave, emitError, emitEvent, comments]
  );

  return { handleSave };
}

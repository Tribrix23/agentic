/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useDocumentLoad — the document *load* path extracted out of the DocxEditor
 * god-component (Spec #6, part 1 — the lower-risk half of `useDocumentIO`; the
 * save path stays in the component for a dedicated pass since a bug there is
 * data-loss, not a recoverable failed load).
 *
 * Owns: parsing a .docx buffer into the editor, the generation guard that
 * discards a slow parse superseded by a newer load, the real on-disk size for
 * the Properties dialog, restoring a server version, and the effect that reacts
 * to `documentBuffer` / `initialDocument` prop changes.
 *
 * The shared, reused pieces (`resetForNewDocument`, `loadParsedDocument`) stay
 * in the component — the imperative ref API and the agent bridge also call them
 * — and are passed in. State writes go through narrow callbacks so the hook
 * never touches the component's giant state object directly.
 */

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { parseDocx } from '@eigenpal/docx-core/docx';
import { type DocxInput } from '@eigenpal/docx-core/utils';
import type { Document } from '@eigenpal/docx-core/types/document';
import { downloadServerVersion, type ServerVersionBackend } from '../version-history/server-source';

export interface UseDocumentLoadOptions {
  /** Raw .docx bytes to load; null/undefined loads `initialDocument` instead. */
  documentBuffer?: DocxInput | null;
  /** Pre-parsed document to load when there is no `documentBuffer`. */
  initialDocument?: Document | null;
  /** When true the caller populates PM directly (e.g. y-prosemirror) — skip loading. */
  externalContent?: boolean;
  /** Version-history backend for `handleRestoreServerVersion`. */
  versionBackend?: ServerVersionBackend;
  /** Reset per-document state (comments, tracked changes, refs). Shared. */
  resetForNewDocument: () => void;
  /** Commit a parsed document into the editor. Shared with the ref API/agent. */
  loadParsedDocument: (doc: Document) => void;
  /** Mark the editor dirty/clean — a fresh load starts clean. */
  markDirty: (dirty: boolean) => void;
  /** Surface a load/parse error to the host. */
  emitError: (err: Error) => void;
  /** Enter the loading state (isLoading: true, parseError: null). */
  onLoadStart: () => void;
  /** Enter the error state (isLoading: false, parseError: message). */
  onLoadError: (message: string) => void;
}

export interface UseDocumentLoadReturn {
  loadBuffer: (buffer: DocxInput) => Promise<void>;
  handleRestoreServerVersion: (version: number) => void;
  /** Real on-disk byte size of the most recently loaded document (Properties). */
  loadedSizeRef: MutableRefObject<number | null>;
}

export function useDocumentLoad(opts: UseDocumentLoadOptions): UseDocumentLoadReturn {
  const {
    documentBuffer,
    initialDocument,
    externalContent,
    versionBackend,
    resetForNewDocument,
    loadParsedDocument,
    markDirty,
    emitError,
    onLoadStart,
    onLoadError,
  } = opts;

  // Monotonic generation so a slow parse of an old buffer can't clobber a newer
  // load; internal to the load path.
  const loadGenerationRef = useRef(0);
  const loadedSizeRef = useRef<number | null>(null);

  const loadBuffer = useCallback(
    async (buffer: DocxInput) => {
      // Capture the REAL on-disk size of the loaded bytes (not an in-memory
      // serialization estimate) for the Properties dialog.
      loadedSizeRef.current =
        buffer instanceof Blob
          ? buffer.size
          : buffer instanceof ArrayBuffer
            ? buffer.byteLength
            : ArrayBuffer.isView(buffer)
              ? buffer.byteLength
              : null;
      const generation = ++loadGenerationRef.current;
      resetForNewDocument();
      // Loading a fresh buffer wipes the prior edit state, so the new document
      // starts clean.
      markDirty(false);
      onLoadStart();
      try {
        const doc = await parseDocx(buffer);
        // Discard result if a newer load was started while we were parsing.
        if (loadGenerationRef.current !== generation) return;
        loadParsedDocument(doc);
      } catch (error) {
        if (loadGenerationRef.current !== generation) return;
        const message = error instanceof Error ? error.message : 'Failed to parse document';
        onLoadError(message);
        emitError(error instanceof Error ? error : new Error(message));
      }
    },
    [resetForNewDocument, loadParsedDocument, markDirty, emitError, onLoadStart, onLoadError]
  );

  // Restore a server-persisted revision: download its .docx and load it. In a
  // live collab room the load flows through the same PM path, so peers converge
  // on the restored content. Failures surface via onError rather than throwing.
  const handleRestoreServerVersion = useCallback(
    (version: number) => {
      if (!versionBackend) return;
      void (async () => {
        try {
          const buf = await downloadServerVersion(versionBackend, version);
          await loadBuffer(buf);
        } catch (err) {
          emitError(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    },
    [versionBackend, loadBuffer, emitError]
  );

  // React to document / documentBuffer prop changes.
  useEffect(() => {
    // External content mode: caller populates PM directly — skip the load.
    if (externalContent) return;

    if (!documentBuffer) {
      if (initialDocument) {
        loadParsedDocument(initialDocument);
      }
      return;
    }

    void loadBuffer(documentBuffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentBuffer, initialDocument, externalContent]);

  return { loadBuffer, handleRestoreServerVersion, loadedSizeRef };
}

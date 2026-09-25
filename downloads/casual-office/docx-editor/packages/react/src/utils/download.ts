/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/** The OOXML MIME type for a Word `.docx` document. */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Wrap serialized `.docx` bytes in a Blob with the correct OOXML MIME type. */
export function createDocxBlob(bytes: BlobPart): Blob {
  return new Blob([bytes], { type: DOCX_MIME });
}

/**
 * Trigger a browser file download for `blob` under `fileName`.
 *
 * The classic anchor-click dance (object URL → hidden `<a download>` → click →
 * deferred revoke) was duplicated four times across DocxEditor's save/export
 * handlers. Extracting it removes that duplication and pulls one small IO
 * primitive out of the god-component (docs/internal/40 — DocxEditor
 * decomposition). Pure with respect to React: no state, no closures.
 *
 * The revoke is deferred a tick because Safari cancels an in-flight download if
 * the object URL is revoked synchronously after `click()`.
 */
export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The document's base name for building an export filename: the trimmed title
 * with any trailing `.docx` stripped, or `fallback` when there's no title.
 * De-duplicates the same expression that appeared six times across DocxEditor's
 * save/export/print handlers. `fallback` is a parameter because the callers use
 * a title-case `Document` for print/PDF titles and lower-case `document` for the
 * downloaded `.docx` filename — preserved rather than silently unified.
 */
export function documentBaseName(documentName: string | undefined, fallback = 'Document'): string {
  return (documentName?.trim() || fallback).replace(/\.docx$/i, '');
}

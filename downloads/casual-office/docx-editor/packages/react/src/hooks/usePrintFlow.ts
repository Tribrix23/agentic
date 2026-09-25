/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * usePrintFlow — the print / Export-as-PDF pipeline extracted out of the
 * DocxEditor god-component (Spec #6 decomposition). This is a clean, contiguous
 * slice: it clones the painted pages into a print window and never touches the
 * save/serialize path, so a bug here is a recoverable print glitch, not data
 * loss. (`handleExportPdf` reuses the print pipeline — browsers' "Save as PDF"
 * destination uses the print window title as the default filename.)
 */

import { useCallback, type RefObject } from 'react';
import { forceRenderAllPages, restoreVirtualization } from '@eigenpal/docx-core/layout-painter';
import { documentBaseName } from '../utils/download';

export interface UsePrintFlowOptions {
  /** Ref to the editor container (holds `.paged-editor__pages`). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Current document name — drives the print window title / PDF filename. */
  documentName?: string;
  /** Host print hook (analytics / desktop). */
  onPrint?: () => void;
  /** Host print-to-PDF override; returns true when it handled the export. */
  onExportPdf?: (suggestedName: string) => boolean | Promise<boolean>;
}

export interface UsePrintFlowReturn {
  triggerPrintFlow: (windowTitle: string) => void;
  handleDirectPrint: () => Promise<void>;
  handleExportPdf: () => Promise<void>;
}

export function usePrintFlow(opts: UsePrintFlowOptions): UsePrintFlowReturn {
  const { containerRef, documentName, onPrint, onExportPdf } = opts;

  // `handleDirectPrint` is also the underlying flow for Export as PDF —
  // browsers' "Save as PDF" destination in the print dialog uses the
  // print window's <title> as the default filename, so we let callers
  // pass one. The visible HTML and CSS are identical for print and PDF.
  const triggerPrintFlow = useCallback(
    (windowTitle: string) => {
      const pagesEl = containerRef.current?.querySelector('.paged-editor__pages');
      if (!pagesEl) {
        window.print();
        onPrint?.();
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        // Popup blocked — fall back to window.print()
        window.print();
        onPrint?.();
        return;
      }

      // Collect all @font-face rules from the current page
      const fontFaceRules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSFontFaceRule) {
              fontFaceRules.push(rule.cssText);
            }
          }
        } catch {
          // Cross-origin stylesheets can't be read — skip
        }
      }

      // Force-render all virtualized page shells so the clone captures every
      // page's content, not just the pages near the viewport (issue #141).
      forceRenderAllPages(pagesEl as HTMLElement);

      // Clone pages and remove transforms/shadows
      const pagesClone = pagesEl.cloneNode(true) as HTMLElement;
      pagesClone.style.cssText = 'display: block; margin: 0; padding: 0;';
      for (const page of Array.from(pagesClone.querySelectorAll('.layout-page'))) {
        const el = page as HTMLElement;
        el.style.boxShadow = 'none';
        el.style.margin = '0';
      }

      // Pin the printed page box to the document's actual page size. Each
      // `.layout-page` carries the WYSIWYG page dimensions as inline px
      // width/height; without this, `@page { size: auto }` lets the print
      // dialog's default paper (often Letter) drive the PDF, so an A4 (or
      // landscape) document exports at the wrong size. Uniform page size is
      // the overwhelmingly common case; mixed-size docs fall back no worse
      // than `auto` did.
      const firstPrintPage = pagesClone.querySelector('.layout-page') as HTMLElement | null;
      const pageSizeRule =
        firstPrintPage?.style.width && firstPrintPage?.style.height
          ? `${firstPrintPage.style.width} ${firstPrintPage.style.height}`
          : 'auto';

      // Restore memory-efficient virtualization after the clone is done.
      requestAnimationFrame(() => {
        restoreVirtualization(pagesEl as HTMLElement);
      });

      const titleEscaped = windowTitle
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${titleEscaped}</title>
<style>
${fontFaceRules.join('\n')}
* { margin: 0; padding: 0; }
body { background: white; }
.layout-page { break-after: page; }
.layout-page:last-child { break-after: auto; }
@page { margin: 0; size: ${pageSizeRule}; }
</style>
</head><body>${pagesClone.outerHTML}</body></html>`);
      printWindow.document.close();

      // Wait for fonts/images then print. The fallback timeout below
      // covers browsers that never fire onload on a document-written
      // window; we clear it from inside onload so the normal path
      // doesn't double-trigger print() and surface a second print
      // dialog the user already cancelled. Pre-fix the second print
      // fired ~1s after the user dismissed the first.
      let printed = false;
      let fallback: ReturnType<typeof setTimeout> | null = null;
      const runPrint = () => {
        if (printed) return;
        printed = true;
        if (fallback !== null) {
          clearTimeout(fallback);
          fallback = null;
        }
        printWindow.print();
        printWindow.close();
      };
      printWindow.onload = runPrint;
      fallback = setTimeout(() => {
        fallback = null;
        if (!printWindow.closed) runPrint();
      }, 1000);

      onPrint?.();
    },
    [containerRef, onPrint]
  );

  const handleDirectPrint = useCallback(async () => {
    // Desktop (WebKitGTK): the browser print path opens `window.open('','_blank')`,
    // which returns null in the Tauri webview and falls back to printing the whole
    // editor chrome. Real printing there is unreliable, so route Print through the
    // host's print-to-PDF (same as Export as PDF) — the user prints the saved PDF
    // from their OS viewer. Web keeps the normal print dialog.
    if (onExportPdf) {
      const base = documentBaseName(documentName);
      if (await onExportPdf(`${base}.pdf`)) return;
    }
    triggerPrintFlow('Print');
  }, [triggerPrintFlow, onExportPdf, documentName]);

  // Export as PDF reuses the print pipeline — browsers' print dialogs
  // include a "Save as PDF" destination that uses the print window's
  // title as the default filename. We pass the current document name
  // (or a sensible default) so the saved file is `<doc>.pdf` rather
  // than `Print.pdf`. There is no JS API to preselect the PDF
  // destination — the user picks it once in the print dialog.
  const handleExportPdf = useCallback(async () => {
    const base = documentBaseName(documentName);
    // Desktop: route through the host's native print-to-PDF (selectable text,
    // reliable on WebKitGTK) instead of the browser print dialog. If the host
    // didn't handle it (web, or user cancelled the save dialog), fall back.
    if (onExportPdf && (await onExportPdf(`${base}.pdf`))) return;
    triggerPrintFlow(base);
  }, [triggerPrintFlow, documentName, onExportPdf]);

  return { triggerPrintFlow, handleDirectPrint, handleExportPdf };
}

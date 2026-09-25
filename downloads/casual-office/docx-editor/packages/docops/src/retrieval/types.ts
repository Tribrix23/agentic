/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Retrieval types for the local-first RAG layer. A chunk is a unit of document
 * (a section, a band of spreadsheet rows) carrying the LOCATOR metadata the
 * write tools consume (blockIds / a1Range), so retrieve-then-edit still targets
 * the right place.
 */

export interface RetrievalChunk {
  id: string;
  /** The text scored + returned. For docs, prefix a heading breadcrumb. */
  text: string;
  /** Locator + display metadata (blockIds, headingPath, a1Range, sheetName…). */
  meta?: Record<string, unknown>;
}

export interface RetrievedChunk extends RetrievalChunk {
  score: number;
}

export interface RetrieveOptions {
  /** Max chunks returned. Default 5. */
  k?: number;
  /** Total character budget across returned chunks (~token budget × 3.6). */
  charBudget?: number;
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /** True when k or the char budget capped the returned set. */
  truncated: boolean;
}

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * WorkspaceIndex — BM25 retrieval across MANY documents (the user's local
 * folder), the on-device answer to the cloud "workspace RAG" the incumbents
 * ship. Everything stays in memory / on the machine: the host (desktop shell)
 * reads local files and extracts plain text; this indexes and retrieves across
 * them, returning per-source citations so the model can attribute answers.
 *
 * North-star O2. Reuses the same BM25 core as single-document search.
 */

import { retrieve } from './bm25';
import type { RetrievalChunk } from './types';

export interface WorkspaceDoc {
  /** Stable id — the file path. */
  id: string;
  /** Display name for citations (e.g. the file name). */
  name: string;
  /** Full plain text; the host extracts this from .docx/.xlsx/etc. */
  text: string;
}

export interface WorkspaceHit {
  docId: string;
  docName: string;
  snippet: string;
  score: number;
}

export interface WorkspaceSearchResult {
  hits: WorkspaceHit[];
  /** Distinct source documents represented in the hits (for a citation list). */
  sources: { docId: string; docName: string }[];
  truncated: boolean;
}

const CHUNK_CHARS = 1800;
const SNIPPET_CHARS = 700;

/** Split plain text into ~CHUNK_CHARS chunks on paragraph boundaries. */
function chunkText(text: string): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const para of paras) {
    if (buf && buf.length + para.length > CHUNK_CHARS) {
      chunks.push(buf);
      buf = '';
    }
    // A single oversized paragraph becomes its own (possibly long) chunk.
    buf = buf ? `${buf}\n${para}` : para;
    if (buf.length >= CHUNK_CHARS) {
      chunks.push(buf);
      buf = '';
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export class WorkspaceIndex {
  private chunks: RetrievalChunk[] = [];
  private readonly docs = new Map<string, string>(); // id → name

  /** Add or replace a document in the index. */
  add(doc: WorkspaceDoc): void {
    this.remove(doc.id);
    this.docs.set(doc.id, doc.name);
    chunkText(doc.text).forEach((text, i) => {
      this.chunks.push({
        id: `${doc.id}#${i}`,
        text,
        meta: { docId: doc.id, docName: doc.name },
      });
    });
  }

  /** Remove a document (e.g. deleted or closed file). */
  remove(docId: string): void {
    if (!this.docs.has(docId)) return;
    this.docs.delete(docId);
    this.chunks = this.chunks.filter((c) => (c.meta as { docId: string }).docId !== docId);
  }

  clear(): void {
    this.chunks = [];
    this.docs.clear();
  }

  get size(): number {
    return this.docs.size;
  }

  /** Retrieve the passages most relevant to `query` across ALL indexed docs. */
  search(query: string, k = 6): WorkspaceSearchResult {
    const result = retrieve(this.chunks, query, { k });
    const hits: WorkspaceHit[] = result.chunks.map((c) => {
      const meta = c.meta as { docId: string; docName: string };
      return {
        docId: meta.docId,
        docName: meta.docName,
        snippet: c.text.slice(0, SNIPPET_CHARS),
        score: Math.round(c.score * 100) / 100,
      };
    });
    // Distinct sources, first-seen order, for a citation list.
    const seen = new Set<string>();
    const sources: { docId: string; docName: string }[] = [];
    for (const h of hits) {
      if (seen.has(h.docId)) continue;
      seen.add(h.docId);
      sources.push({ docId: h.docId, docName: h.docName });
    }
    return { hits, sources, truncated: result.truncated };
  }
}

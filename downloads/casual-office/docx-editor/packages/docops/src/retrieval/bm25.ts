/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * BM25 lexical retrieval — pure TypeScript, no embeddings, no model, no extra
 * download. Runs in microseconds over in-memory chunks so grounding happens
 * JS-side BEFORE the prompt reaches the (8k-context) local model. This is the
 * fix for get_doc_stats dumping the whole document and blowing the context.
 */

import type { RetrievalChunk, RetrieveOptions, RetrieveResult, RetrievedChunk } from './types';

const K1 = 1.5;
const B = 0.75;
const DEFAULT_K = 5;
const DEFAULT_CHAR_BUDGET = 10_000; // ~2,800 tokens

// Small, high-frequency stopword set — enough to stop query noise dominating.
const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have i in is it its of on or that the to was were will with ' +
    'this these those what which who whom whose when where why how do does did can could should would may might'
  ).split(' ')
);

/** Lowercase, split on non-alphanumerics, drop stopwords + 1-char tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Precomputed BM25 index over a fixed set of chunks. */
export class Bm25Index {
  private readonly docs: { chunk: RetrievalChunk; tf: Map<string, number>; len: number }[] = [];
  private readonly df = new Map<string, number>();
  private avgLen = 0;

  constructor(chunks: RetrievalChunk[]) {
    let totalLen = 0;
    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
      for (const tok of tf.keys()) this.df.set(tok, (this.df.get(tok) ?? 0) + 1);
      this.docs.push({ chunk, tf, len: tokens.length });
      totalLen += tokens.length;
    }
    this.avgLen = this.docs.length ? totalLen / this.docs.length : 0;
  }

  /** Score every chunk against the query; returns them sorted by score desc. */
  score(query: string): RetrievedChunk[] {
    const qTokens = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const scored = this.docs.map(({ chunk, tf, len }) => {
      let s = 0;
      for (const q of qTokens) {
        const f = tf.get(q);
        if (!f) continue;
        const n = this.df.get(q) ?? 0;
        // BM25 idf with the +0.5 smoothing; clamp to >= 0 so ubiquitous terms
        // don't push scores negative.
        const idf = Math.max(0, Math.log((N - n + 0.5) / (n + 0.5) + 1));
        const denom = f + K1 * (1 - B + (B * len) / (this.avgLen || 1));
        s += idf * ((f * (K1 + 1)) / denom);
      }
      return { ...chunk, score: s };
    });
    return scored.sort((a, b) => b.score - a.score);
  }
}

/**
 * Retrieve the top chunks for a query, packed greedily to a character budget so
 * the injected context is provably bounded. `truncated` is true when k or the
 * budget dropped chunks that still had a positive score.
 */
export function retrieve(
  chunks: RetrievalChunk[],
  query: string,
  options: RetrieveOptions = {}
): RetrieveResult {
  const k = options.k ?? DEFAULT_K;
  const charBudget = options.charBudget ?? DEFAULT_CHAR_BUDGET;
  const ranked = new Bm25Index(chunks).score(query).filter((c) => c.score > 0);

  const picked: RetrievedChunk[] = [];
  let used = 0;
  let truncated = false;
  for (const chunk of ranked) {
    if (picked.length >= k) {
      truncated = true;
      break;
    }
    if (used + chunk.text.length > charBudget) {
      // Skip this one but keep scanning for a smaller chunk that still fits.
      truncated = true;
      continue;
    }
    picked.push(chunk);
    used += chunk.text.length;
  }
  return { chunks: picked, truncated };
}

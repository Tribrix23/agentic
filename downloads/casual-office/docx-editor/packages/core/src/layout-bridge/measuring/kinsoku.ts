/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Kinsoku shori (禁則処理) — East Asian forbidden line-start/end character
 * rules (OOXML `w:kinsoku`, ECMA-376 §17.3.1.16).
 *
 * CJK text has no spaces, so the line-breaker's only break candidates come
 * from `findMaxFittingLength`'s raw per-character fit — which knows nothing
 * about typography convention. Without this adjustment, a line can start
 * with closing punctuation (。」』) or end with an opening bracket (「『(),
 * which every CJK-aware renderer (Word, LibreOffice, browsers via
 * `line-break: strict`) forbids.
 *
 * Scope: covers the common, high-frequency character classes (CJK
 * full-width punctuation/brackets, Japanese small kana and prolongation
 * mark) shared across Chinese and Japanese typesetting conventions. Not
 * exhaustive (e.g. omits some rarer JIS X 4051 classes like Level 2
 * line-end/start sets) — extend the sets below if a real document surfaces
 * a gap, rather than trying to encode the full standard up front.
 */

/** Characters that must never be the FIRST character of a line (行頭禁則). */
const LINE_START_FORBIDDEN = new Set([
  // Closing brackets (full-width + common half-width equivalents)
  '）',
  ')',
  '］',
  ']',
  '｝',
  '}',
  '〉',
  '》',
  '「',
  '」',
  '『',
  '』',
  '【',
  '】',
  '〔',
  '〕',
  '〈',
  // Closing quotes
  '’',
  '”',
  // Small kana (Japanese)
  'ぁ',
  'ぃ',
  'ぅ',
  'ぇ',
  'ぉ',
  'っ',
  'ゃ',
  'ゅ',
  'ょ',
  'ゎ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
  'ッ',
  'ャ',
  'ュ',
  'ョ',
  'ヮ',
  // Prolonged sound mark, iteration marks
  'ー',
  'ゝ',
  'ゞ',
  'ヽ',
  'ヾ',
  '々',
  // Punctuation / small marks that cannot start a line
  '、',
  '。',
  '，',
  '．',
  '・',
  '：',
  '；',
  '！',
  '？',
  '!',
  '?',
  ',',
  '.',
  '‐',
  '–',
  '～', // full-width tilde (〜)
]);

/** Characters that must never be the LAST character of a line (行末禁則). */
const LINE_END_FORBIDDEN = new Set([
  '（',
  '(',
  '［',
  '[',
  '｛',
  '{',
  '〈',
  '《',
  '「',
  '『',
  '【',
  '〔',
  '‘',
  '“',
]);

export function isLineStartForbidden(char: string): boolean {
  return LINE_START_FORBIDDEN.has(char);
}

export function isLineEndForbidden(char: string): boolean {
  return LINE_END_FORBIDDEN.has(char);
}

/**
 * Adjust a tentative hard-break point `[start, end)` within `text` so it
 * doesn't split a kinsoku-forbidden pair across lines.
 *
 * If `text[end]` (what would start the next line) is line-start-forbidden,
 * EXTEND the current line to include it ("oidashi" 追い出し — the standard
 * resolution; Word and every other CJK-aware renderer accept the current
 * line running slightly past its fitted width here rather than orphaning
 * the character). Repeats while the newly-exposed next character is also
 * forbidden (e.g. "。」" in sequence).
 *
 * Then, if the (possibly now-extended) `text[end - 1]` (the current line's
 * last character) is line-end-forbidden (an opening bracket), SHRINK the
 * line by one so the bracket starts the next line with its content instead
 * of dangling alone at the end of this one.
 *
 * Never shrinks the chunk below one character.
 */
export function adjustKinsokuBreak(text: string, start: number, end: number): number {
  if (end >= text.length) return end; // last chunk — no following line to protect
  let adjusted = end;
  while (adjusted < text.length && isLineStartForbidden(text[adjusted])) {
    adjusted++;
  }
  while (adjusted > start + 1 && isLineEndForbidden(text[adjusted - 1])) {
    adjusted--;
  }
  return adjusted;
}

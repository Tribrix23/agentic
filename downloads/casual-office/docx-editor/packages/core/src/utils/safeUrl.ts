/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * URL scheme allow-listing for untrusted hyperlink hrefs.
 *
 * A `.docx` (or pasted HTML) can carry an arbitrary `href` on a hyperlink or a
 * linked image. Writing that value straight onto an `<a href>` lets a crafted
 * document run script: `javascript:` fires on Enter/click, `data:text/html`
 * navigates to an attacker page in our origin. Every place that turns a
 * document-supplied URL into a live anchor MUST route it through `safeUrl`.
 *
 * Relative URLs, fragments (`#bookmark`), and protocol-relative URLs (`//host`)
 * carry no scheme and are safe to pass through. Anything with an explicit scheme
 * must be in the allow-list or it is dropped to an empty string.
 */

/** Schemes a hyperlink is allowed to navigate to. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:', 'ftp:', 'sms:']);

// Control characters (including TAB/LF/CR) are used to smuggle blocked schemes
// past naive checks — e.g. `java<TAB>script:` or `java<LF>script:`. Strip them
// first. Built from a pure-ASCII source string so no raw control bytes live in
// this file.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Return `raw` if it is a safe URL to place on an `<a href>`, otherwise `''`.
 *
 * Safe = no scheme (relative / fragment / protocol-relative), or a scheme in
 * {@link ALLOWED_SCHEMES}. `javascript:`, `data:`, `vbscript:`, `file:`,
 * `blob:`, `about:` and any other scheme are rejected.
 */
export function safeUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return '';

  const match = SCHEME.exec(cleaned);
  if (!match) {
    // No scheme: relative path, `#fragment`, or `//host` — safe.
    return cleaned;
  }
  const scheme = `${match[1].toLowerCase()}:`;
  return ALLOWED_SCHEMES.has(scheme) ? cleaned : '';
}

/** True when `raw` is already a safe URL (unchanged by {@link safeUrl}). */
export function isSafeUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return safeUrl(raw) === raw.replace(CONTROL_CHARS, '').trim();
}

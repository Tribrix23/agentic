/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Theme-adaptive syntax highlighting for the source editor.
 *
 * CodeMirror's built-in `defaultHighlightStyle` bakes in light-mode colors
 * (dark-blue keywords, etc.) that are barely legible on a dark background. We
 * define the token colors as CSS custom properties instead, and let
 * markdown-editor.css swap those properties under `[data-theme='dark']` — so
 * YAML keys, markdown syntax, comments and strings stay readable in BOTH
 * themes without any runtime reconfiguration.
 */

import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const themeHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--md-hl-keyword)' },
  {
    tag: [t.propertyName, t.definition(t.propertyName), t.labelName],
    color: 'var(--md-hl-property)',
  },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--md-hl-string)' },
  { tag: [t.number, t.bool, t.atom, t.null], color: 'var(--md-hl-atom)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--md-hl-comment)', fontStyle: 'italic' },
  { tag: [t.variableName, t.name], color: 'var(--md-hl-variable)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--md-hl-type)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'var(--md-hl-punct)' },
  { tag: [t.meta, t.documentMeta], color: 'var(--md-hl-meta)' },
  // Markdown structural tags (source mode of a .md file).
  { tag: [t.heading, t.heading1, t.heading2, t.heading3], color: 'var(--md-hl-keyword)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--md-hl-property)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--md-hl-string)' },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--md-hl-comment)' },
]);

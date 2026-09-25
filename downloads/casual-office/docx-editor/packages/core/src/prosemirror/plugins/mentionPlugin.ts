/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * MentionPlugin — detects when the user is typing a @-mention
 * in the document body and exposes the active state for a React
 * popover to consume.
 *
 * The plugin has NO side-effects: it only reads the PM state and
 * exposes `{active, from, query}` through its PluginKey. The React
 * layer reads this on every selection change and shows/hides the
 * popover accordingly.
 *
 * Detection rules (mirrors the AddCommentCard implementation):
 *  - Cursor must be collapsed.
 *  - Walking backwards from the cursor, the first word-run must start
 *    with "@" and no whitespace separates "@" from the cursor.
 *  - "@" must NOT be preceded by an alphanumeric (email guard).
 *  - Query (text after "@") must be ≤30 chars.
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorState, Transaction } from 'prosemirror-state';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MentionPluginState {
  active: boolean;
  /** Absolute doc position of the "@" character (not including it). */
  from: number;
  /** Text typed after "@", lowercased, used to filter suggestions. */
  query: string;
}

// ── Plugin key (consumed by DocxEditor to read state) ──────────────────────

export const MENTION_PLUGIN_KEY = new PluginKey<MentionPluginState>('mention');

// ── Detection ──────────────────────────────────────────────────────────────

const IDLE: MentionPluginState = { active: false, from: 0, query: '' };

function detectMention(state: EditorState): MentionPluginState {
  const { $from, empty } = state.selection;
  if (!empty) return IDLE; // only fire on collapsed cursor

  // text of the parent text-block up to the cursor
  const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

  for (let i = textBefore.length - 1; i >= 0; i--) {
    const ch = textBefore[i];

    if (ch === '@') {
      // Email guard: "@" preceded by alphanumeric → skip (e.g. user@host)
      const prev = i > 0 ? textBefore[i - 1] : '';
      if (prev && /[A-Za-z0-9]/.test(prev)) return IDLE;

      const query = textBefore.slice(i + 1);
      // Reject overlong / whitespace-containing queries
      if (query.length > 30 || /\s/.test(query)) return IDLE;

      // Doc position of "@": $from.start() is the position of the first char
      // inside the parent block, so "@" sits at start + i.
      const atDocPos = $from.start() + i;
      return { active: true, from: atDocPos, query: query.toLowerCase() };
    }

    // A whitespace before we found "@" → not a mention context
    if (/\s/.test(ch)) return IDLE;
  }
  return IDLE;
}

// ── Plugin factory ─────────────────────────────────────────────────────────

export function createMentionPlugin(): Plugin<MentionPluginState> {
  return new Plugin<MentionPluginState>({
    key: MENTION_PLUGIN_KEY,
    state: {
      init(): MentionPluginState {
        return IDLE;
      },
      apply(
        _tr: Transaction,
        _prev: MentionPluginState,
        _oldState: EditorState,
        newState: EditorState
      ): MentionPluginState {
        return detectMention(newState);
      },
    },
  });
}

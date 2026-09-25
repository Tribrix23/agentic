/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Notebook / Live-Preview decorations for CodeMirror 6.
 *
 * This is the "pro" mode: one editing surface where markdown renders inline
 * as you type — headings enlarge, **bold** shows bold, `code` gets a chip —
 * while the underlying text stays real, copy-paste-able markdown. Syntax
 * markers (##, **, _, `, ~~) are hidden until the caret lands on the element,
 * at which point the raw markdown is revealed so you can edit it (the same
 * behaviour Obsidian's Live Preview uses).
 *
 * It works off the markdown parse tree that @codemirror/lang-markdown already
 * maintains, so there's no second parser and no separate preview pane.
 */

import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';

/** A rendered task-list checkbox that replaces the raw `[ ]` / `[x]` marker. */
class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM() {
    const box = document.createElement('span');
    box.className = 'cm-md-checkbox' + (this.checked ? ' cm-md-checkbox-done' : '');
    box.setAttribute('aria-hidden', 'true');
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** A rendered bullet dot that replaces a `-` / `*` / `+` list marker. */
class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const dot = document.createElement('span');
    dot.className = 'cm-md-bullet';
    dot.textContent = '•';
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }
}

/** A rendered horizontal rule that replaces a `---` / `***` line. */
class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-md-hr';
    hr.setAttribute('aria-hidden', 'true');
    return hr;
  }
}

/** Heading containers → the line class that sizes them. */
const HEADING_LINE: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
};

/** Inline containers → the mark class that styles their content. */
const INLINE_STYLE: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  InlineCode: 'cm-md-code',
  Strikethrough: 'cm-md-strike',
};

/** Syntax-marker node names that get hidden when the caret is elsewhere. */
const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'StrikethroughMark']);

const hiddenMark = Decoration.replace({});

/** True when any selection range touches [from, to] (caret is on the element). */
function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // Task-list marker (GFM): render `[ ]` / `[x]` as a checkbox, unless the
        // caret is on it (then show the raw marker so it can be edited).
        if (name === 'TaskMarker') {
          if (!selectionTouches(state, node.from, node.to)) {
            const checked = /x/i.test(state.doc.sliceString(node.from, node.to));
            ranges.push(
              Decoration.replace({ widget: new TaskCheckboxWidget(checked) }).range(
                node.from,
                node.to
              )
            );
          }
          return;
        }

        // Heading: always size the line; hide the leading `#`s (+ one space)
        // unless the caret is on that heading.
        const headingClass = HEADING_LINE[name];
        if (headingClass) {
          const line = state.doc.lineAt(node.from);
          ranges.push(Decoration.line({ class: headingClass }).range(line.from));
          if (!selectionTouches(state, node.from, node.to)) {
            const mark = node.node.firstChild;
            if (mark && mark.name === 'HeaderMark') {
              // eat the single space after the #s so the text starts flush
              let end = mark.to;
              if (state.doc.sliceString(end, end + 1) === ' ') end += 1;
              if (end > mark.from) ranges.push(hiddenMark.range(mark.from, end));
            }
          }
          return;
        }

        // Blockquote: style every line of the quote; hide each `>` marker
        // (+ trailing space) unless the caret is inside the quote.
        if (name === 'Blockquote') {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let n = first; n <= last; n++) {
            ranges.push(Decoration.line({ class: 'cm-md-blockquote' }).range(state.doc.line(n).from));
          }
          return;
        }
        if (name === 'QuoteMark' && !selectionTouches(state, node.from, node.to)) {
          let end = node.to;
          if (state.doc.sliceString(end, end + 1) === ' ') end += 1;
          ranges.push(hiddenMark.range(node.from, end));
          return;
        }

        // Horizontal rule: render the `---` line as a drawn rule.
        if (name === 'HorizontalRule' && !selectionTouches(state, node.from, node.to)) {
          ranges.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
          return;
        }

        // Bullet list marker: render `-` / `*` / `+` as a bullet dot (ordered
        // markers like `1.` are left as-is). Skip task-list items — their
        // checkbox stands in for the marker. Revealed when the caret is on it.
        if (name === 'ListMark' && !selectionTouches(state, node.from, node.to)) {
          const marker = state.doc.sliceString(node.from, node.to);
          const isTaskItem = /^\s*\[[ xX]\]/.test(state.doc.sliceString(node.to, node.to + 5));
          if (/^[-*+]$/.test(marker) && !isTaskItem) {
            ranges.push(
              Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to)
            );
          }
          return;
        }

        // Link: style the display text as a link and hide the `[`, `](url)`
        // scaffolding unless the caret is inside the link.
        if (name === 'Link') {
          if (!selectionTouches(state, node.from, node.to)) {
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (
                  (cursor.name === 'LinkMark' || cursor.name === 'URL') &&
                  cursor.to > cursor.from
                ) {
                  ranges.push(hiddenMark.range(cursor.from, cursor.to));
                }
              } while (cursor.nextSibling());
            }
          }
          ranges.push(Decoration.mark({ class: 'cm-md-link' }).range(node.from, node.to));
          return;
        }

        // Inline emphasis / code / strike: style the content; hide the markers
        // unless the caret is inside the element.
        const inlineClass = INLINE_STYLE[name];
        if (inlineClass) {
          if (node.to > node.from) {
            ranges.push(Decoration.mark({ class: inlineClass }).range(node.from, node.to));
          }
          if (!selectionTouches(state, node.from, node.to)) {
            const cursor = node.node.cursor();
            if (cursor.firstChild()) {
              do {
                if (MARK_NODES.has(cursor.name) && cursor.to > cursor.from) {
                  ranges.push(hiddenMark.range(cursor.from, cursor.to));
                }
              } while (cursor.nextSibling());
            }
          }
        }
      },
    });
  }

  // Decoration.set sorts and validates; line decorations must sort before the
  // mark/replace decorations at the same position, which `true` handles.
  return Decoration.set(ranges, true);
}

/**
 * The live-preview view plugin. Add to the editor (via a Compartment) only in
 * notebook mode; recomputes on edits, selection moves, and viewport scroll.
 */
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

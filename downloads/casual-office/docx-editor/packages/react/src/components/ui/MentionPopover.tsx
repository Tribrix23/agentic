/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * MentionPopover — floating suggestion list shown while the user
 * types a @-mention in the document body.
 *
 * Mirrors the AddCommentCard inline mention dropdown but is positioned
 * relative to the page canvas (fixed-position) rather than inside a
 * sidebar textarea.
 *
 * The parent (DocxEditor) is responsible for:
 *  - Detecting the mention context via MentionPlugin state
 *  - Computing the anchor rect via view.coordsAtPos(mentionFrom)
 *  - Inserting the chosen name into the PM document
 *  - Routing arrow-key / Enter / Escape events here while the popover is open
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

// ── Props ─────────────────────────────────────────────────────────────────

export interface MentionPopoverProps {
  /** Whether the popover is currently visible */
  visible: boolean;
  /** Viewport-relative rect of the @ trigger (from view.coordsAtPos) */
  anchor: { top: number; bottom: number; left: number } | null;
  /** All candidate names (not yet filtered — this component filters by query) */
  suggestions: readonly string[];
  /** Current query text (lowercase) to filter against suggestions */
  query: string;
  /** Called when the user picks a name */
  onPick: (name: string) => void;
  /** Called when Escape is pressed or clicked outside */
  onDismiss: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 8;
const POPOVER_WIDTH = 220;
const ROW_HEIGHT = 34;

const containerStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 2000,
  background: '#ffffff',
  border: '1px solid var(--doc-border, #dadce0)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  width: POPOVER_WIDTH,
  overflow: 'hidden',
  padding: '4px 0',
  userSelect: 'none',
};

// ── Component ──────────────────────────────────────────────────────────────

export function MentionPopover({
  visible,
  anchor,
  suggestions,
  query,
  onPick,
  onDismiss,
}: MentionPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // Filter suggestions by query
  const filtered = suggestions
    .filter((name) => name.toLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS);

  // Reset active index when the filtered list changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query, suggestions]);

  // Expose keyboard navigation so DocxEditor can call handleKey
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const name = filtered[Math.min(activeIdx, filtered.length - 1)];
        if (name) onPick(name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    };
    // Capture phase so PM keymap doesn't eat the keys first
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [visible, filtered, activeIdx, onPick, onDismiss]);

  // Click outside to dismiss
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [visible, onDismiss]);

  if (!visible || !anchor || filtered.length === 0) return null;

  // Position below the anchor, flip up if near bottom of viewport
  const totalH = filtered.length * ROW_HEIGHT + 8;
  const spaceBelow = window.innerHeight - anchor.bottom - 8;
  const top = spaceBelow >= totalH ? anchor.bottom + 4 : anchor.top - totalH - 4;
  const left = Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - 8);

  return (
    <div
      ref={containerRef}
      style={{ ...containerStyle, top, left }}
      onMouseDown={(e) => e.preventDefault()} // don't steal focus from PM
    >
      {filtered.map((name, i) => {
        const isActive = i === activeIdx;
        return (
          <button
            key={name}
            type="button"
            onMouseEnter={() => setActiveIdx(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(name);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              height: ROW_HEIGHT,
              padding: '0 12px',
              border: 'none',
              background: isActive ? 'var(--doc-bg-hover, #f1f3f4)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              gap: 8,
              font: 'inherit',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--doc-primary, #1a73e8)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--doc-text-on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

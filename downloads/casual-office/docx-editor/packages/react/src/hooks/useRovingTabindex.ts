/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * useRovingTabindex — the WAI-ARIA toolbar keyboard pattern for a
 * `role="toolbar"` container: the toolbar is a SINGLE tab stop (one item has
 * tabindex=0, the rest tabindex=-1), and Left/Right/Home/End move focus (and
 * the tab stop) between items. Without this, every one of the ~30 formatting
 * buttons is its own tab stop, so a keyboard / AT user has to tab through all
 * of them to get past the toolbar.
 *
 * Container-level and imperative: it manages `tabIndex` on the focusable
 * descendants directly, so individual buttons need no changes. `ToolbarButton`
 * renders a plain `<button>` with no `tabIndex` prop, so React never resets the
 * roving state on re-render. Popups (font / color / style pickers) portal
 * OUTSIDE the container, so their internal arrow-key handling is untouched.
 */

import { useEffect, type RefObject } from 'react';

const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);

/** Elements that consume Left/Right themselves — don't hijack their arrows. */
function editsOwnArrows(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

export function useRovingTabindex(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Visible, enabled focusable items directly inside the toolbar. Popup
    // contents live in a portal outside `container`, so they're excluded.
    const getItems = (): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([disabled])'
        )
      ).filter((el) => el.offsetParent !== null);

    const setActive = (items: HTMLElement[], activeIdx: number): void => {
      items.forEach((el, i) => {
        el.tabIndex = i === activeIdx ? 0 : -1;
      });
    };

    // Establish exactly one tab stop. Preserve an already-active item (so a
    // re-render that adds/removes context buttons doesn't jump the tab stop).
    const init = (): void => {
      const items = getItems();
      if (items.length === 0) return;
      const active = items.findIndex((el) => el.tabIndex === 0);
      setActive(items, active >= 0 ? active : 0);
    };
    init();

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!NAV_KEYS.has(e.key)) return;
      if (editsOwnArrows(document.activeElement)) return;
      const items = getItems();
      const current = items.indexOf(document.activeElement as HTMLElement);
      if (current === -1) return; // focus isn't on a toolbar item (e.g. open popup)

      let next: number;
      switch (e.key) {
        case 'ArrowRight':
          next = (current + 1) % items.length;
          break;
        case 'ArrowLeft':
          next = (current - 1 + items.length) % items.length;
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = items.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setActive(items, next);
      items[next].focus();
    };

    // Re-establish the single tab stop when the item set changes (context
    // buttons show/hide). tabIndex writes are attribute changes, which we don't
    // observe, so this can't loop.
    const observer = new MutationObserver(() => init());
    observer.observe(container, { childList: true, subtree: true });

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      observer.disconnect();
    };
  }, [containerRef, enabled]);
}

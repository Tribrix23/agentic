/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Touch selection handles — the draggable start/end pills shown at the ends of
 * a range selection on touch devices (Google-Docs style). Dragging a handle
 * moves that endpoint while the opposite one stays fixed.
 *
 * Presentational + gesture only: it knows nothing about ProseMirror. The parent
 * supplies the two anchor points (in pages-container-relative coordinates, the
 * same space `SelectionOverlay` paints in) and receives viewport-space
 * `clientX/clientY` on each drag move, which it maps back to a document
 * position. Native non-passive `touchmove` listeners (attached on the window
 * for the duration of a drag) let us `preventDefault()` so the page doesn't
 * scroll while a handle is being dragged.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, JSX } from 'react';

export interface HandleAnchor {
  /** Pages-container-relative x of the selection endpoint. */
  x: number;
  /** Pages-container-relative y (top of the endpoint's line box). */
  y: number;
  /** Height of the endpoint's line box. */
  height: number;
}

export interface SelectionHandlesProps {
  /** Start endpoint anchor, or null when there is no range selection. */
  start: HandleAnchor | null;
  /** End endpoint anchor, or null when there is no range selection. */
  end: HandleAnchor | null;
  /** Whether the handles should be shown (touch device + focused range). */
  visible: boolean;
  /** Called when a handle drag begins so the parent can pin the opposite end. */
  onDragStart: (which: 'start' | 'end') => void;
  /** Called on each drag move with viewport coordinates. */
  onDragMove: (clientX: number, clientY: number) => void;
  /** Called when the drag ends (touchend / touchcancel). */
  onDragEnd: () => void;
  /** Handle knob colour (defaults to the Google-blue selection colour). */
  color?: string;
}

const KNOB = 14; // visible knob diameter
const PAD = 30; // transparent touch target around the knob
const DEFAULT_COLOR = '#4285f4';

export function SelectionHandles({
  start,
  end,
  visible,
  onDragStart,
  onDragMove,
  onDragEnd,
  color = DEFAULT_COLOR,
}: SelectionHandlesProps): JSX.Element | null {
  const draggingRef = useRef<'start' | 'end' | null>(null);
  // Latest callbacks, read by the window listeners without re-binding them.
  const moveRef = useRef(onDragMove);
  const endRef = useRef(onDragEnd);
  moveRef.current = onDragMove;
  endRef.current = onDragEnd;

  // Window listeners live for the duration of a drag. Bound imperatively (not
  // via React props) so touchmove is non-passive and can preventDefault().
  const detachRef = useRef<(() => void) | null>(null);
  const detach = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    draggingRef.current = null;
  }, []);

  useEffect(() => detach, [detach]);

  const beginDrag = useCallback(
    (which: 'start' | 'end', e: React.TouchEvent) => {
      // Ignore multi-touch — a 2nd finger means pinch, not a handle drag.
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      draggingRef.current = which;
      onDragStart(which);

      const onMove = (ev: TouchEvent) => {
        if (draggingRef.current === null) return;
        if (ev.touches.length !== 1) {
          detach();
          endRef.current();
          return;
        }
        ev.preventDefault();
        const t = ev.touches[0];
        moveRef.current(t.clientX, t.clientY);
      };
      const onEnd = () => {
        detach();
        endRef.current();
      };

      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
      window.addEventListener('touchcancel', onEnd);
      detachRef.current = () => {
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
      };
    },
    [onDragStart, detach]
  );

  if (!visible || start === null || end === null) return null;

  // Knob just outside the selection: start above its top-left, end below its
  // bottom-right (matches the platform convention).
  const startCx = start.x;
  const startCy = start.y - KNOB / 2;
  const endCx = end.x;
  const endCy = end.y + end.height + KNOB / 2;

  const padStyle = (cx: number, cy: number): CSSProperties => ({
    position: 'absolute',
    left: cx - PAD / 2,
    top: cy - PAD / 2,
    width: PAD,
    height: PAD,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    touchAction: 'none',
    zIndex: 11,
  });

  const knobStyle: CSSProperties = {
    width: KNOB,
    height: KNOB,
    borderRadius: '50%',
    backgroundColor: color,
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
  };

  return (
    <>
      <div
        style={padStyle(startCx, startCy)}
        data-testid="selection-handle-start"
        onTouchStart={(e) => beginDrag('start', e)}
      >
        <div style={knobStyle} />
      </div>
      <div
        style={padStyle(endCx, endCy)}
        data-testid="selection-handle-end"
        onTouchStart={(e) => beginDrag('end', e)}
      >
        <div style={knobStyle} />
      </div>
    </>
  );
}

export default SelectionHandles;

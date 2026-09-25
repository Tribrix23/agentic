# 33 — Header/Footer Editing UX Gaps

**Date:** 2026-07-03 · **Status:** HF-1–6 + BD-1 + BD-2 closed · HF-7 deferred · **Feeds from:** audit this session

Full audit of what is broken, missing, or deferred in the header/footer editing overlay.
See `30-header-edit-positioned-layout.md` for the Phase 1-2 history (faithful render, done).

---

## What works today

- Text editing (typing, bold/italic/etc., undo/redo) inside the HF editor
- Positioned text boxes and floating images render faithfully (Phase 2b, #158)
- Insert Page Number / Total Pages fields
- Different First Page toggle (w:titlePg)
- Different Even & Odd Pages toggle
- Remove header/footer
- Toolbar formatting commands route to the HF PM view while it is active
- Escape key saves and closes

---

## Gap inventory

### HF-1 — Options dropdown stays open after clicking elsewhere
**Status: FIXED (this session) — capture-phase listener**

Root cause: `hf-inline-editor` outer div calls `e.stopPropagation()` on mousedown.
The click-outside `document.addEventListener('mousedown', ...)` used bubble phase,
which `stopPropagation()` killed before it could fire.
Fix: changed to `{ capture: true }` so the listener fires before any bubble handler.

File: `InlineHeaderFooterEditor.tsx:456`

---

### HF-2 — Cannot drag/move textboxes or images in the HF editor
**Status: FIXED (`e0336da`) — drag grip + dragOverridesRef + setNodeMarkup on drop**

Root cause: `syncBoxPositions()` positions boxes via a `<style>` element with `!important`
rules copied from the hidden painted header. There are no drag handles, grab cursors, or
mousedown handlers. `draggable: true` on the PM `textBox` node spec only triggers PM's
tree-level cut-paste drag, not a spatial move.

To fix:
1. Render a drag-handle overlay (absolutely-positioned `<div>` inside `hf-inline-editor`)
   for each boxRect returned by `syncBoxPositions()`.
2. Grip icon (top-left 20×20 square) with `cursor: move`, `pointer-events: all`.
3. `mousedown` on grip → track `(startClientX, startClientY, origPosOffsetH, origPosOffsetV)`.
4. `document.mousemove` → update the drag-override `<style>` rule for that box.
5. `document.mouseup` → dispatch `view.state.tr.setNodeMarkup()` with `posOffsetH += deltaX`,
   `posOffsetV += deltaY`, `displayMode: 'float'`. Store override in `dragOverridesRef` so
   `syncBoxPositions()` does not revert it on next PM transaction.

Regression gate: round-trip must stay pristine; pagination unchanged; `End`-key test passing.

Refs: `InlineHeaderFooterEditor.tsx:263-321`, `TextBoxExtension.ts:74,120`

---

### HF-3 — Cannot resize images or textboxes in the HF editor
**Status: FIXED (`e0336da`) — 4-corner resize handles, live dragStyleRef feedback, setNodeMarkup on drop**

Root cause: The body editor has `ImageSelectionOverlay.tsx` (622 lines) with 4-corner resize
handles, aspect-ratio locking, and drag-to-resize. This component is wired to the body PM
view only. The HF editor has no equivalent.

To fix:
1. After HF-2 lands, add resize handles (8-point — corners + midpoints) to the drag-handle
   overlay for images and textboxes.
2. On resize, update `width`/`height` (and for images `cx`/`cy`) attrs on the PM node.
3. Can reuse the geometry from `ImageSelectionOverlay` but it needs to talk to `viewRef.current`
   (the HF PM view), not the body view.

Refs: `InlineHeaderFooterEditor.tsx`, `ImageSelectionOverlay.tsx:57-80`, `TextBoxExtension.ts:16-18`

---

### HF-4 — No visual hover/selection affordance for positioned elements
**Status: FIXED (`e0336da`) — blue selection border + grab cursor on hover via boxRects overlay**

Hovering over a textbox or image in the HF editor shows no cursor change (`cursor: grab`),
no selection border, no affordance that it is interactive.

Fix: add `cursor: move` + thin `2px dashed #94a3b8` border on hover, `2px solid #2563eb`
on selection, as part of the drag-handle overlay in HF-2.

---

### HF-5 — No right-click context menu in the HF editor
**Status: FIXED (`e0336da`) — ContextMenuPanel: Copy / Paste / Select All / Insert page number / total pages**

The body editor's `TextContextMenu` and `ImageContextMenu` are only wired to body pages
(DocxEditor.tsx:10361-10399). The HF editor has no `onContextMenu` handler.

Fix: wire `onContextMenu` inside `hf-inline-editor`. For text: show a slim subset
(Copy / Paste / Select All / Insert Page Number). For image: show wrap options.
The `InlineHeaderFooterEditor` props would need to accept an `onContextMenu` callback,
or handle the menu internally.

Refs: `InlineHeaderFooterEditor.tsx:495`, `DocxEditor.tsx:10361`

---

### HF-6 — Ruler indentation applied to body PM while HF editor is open causes position drift
**Status: FIXED (`e0336da`) — pointerEvents:none + opacity:0.5 on ruler wrapper; editable=false on HorizontalRuler while hfEditPosition is set**

`syncBoxPositions()` reads BCR from the hidden painted header (`targetElement`). While the
HF editor is open the page painter is not re-invoked (frozen to avoid chaos), so
`.layout-textbox` rects stay at pre-edit positions. If the user drags a ruler indent marker
the body PM updates but the header layout does not; the next `syncBoxPositions()` call
copies stale rects.

Fix (pragmatic): when `hfEditPosition !== null`, disable ruler interaction (pointer-events: none
on the ruler) or show a tooltip "Close header editing to adjust margins".

Refs: `InlineHeaderFooterEditor.tsx:263`, `DocxEditor.tsx` (ruler + hfEditPosition gating)

---

### HF-7 — Format panel inaccessible while editing header
**Status: Open — P2**

The Format panel (right sidebar: wrap type, image position, opacity, etc.) is controlled
by body PM selection state. The HF editor's PM selection is not reported to the parent's
sidebar manager, so selecting an image in the HF editor does not open the Format panel.

Fix: expose a `onNodeSelect` callback from `InlineHeaderFooterEditor` that fires when a
node selection is made (image, textbox), letting `DocxEditor` open the Format panel pointed
at the HF view's node. Requires the Format panel commands to dispatch against
`hfEditorRef.current.getView()` when active.

Refs: `InlineHeaderFooterEditor.tsx:66-68`, `DocxEditor.tsx:1878-1928`

---

## Body-editor gaps (not HF-specific)

### BD-1 — Textboxes in the body cannot be dragged to a new position
**Status: FIXED (`4c391aa`) — drag grip (blue square, top-left) + textBoxDragDelta visual + onMoveTextBox → handleTextBoxSetPosition**

`draggable: true` on `TextBoxExtension` enables PM cut-paste reordering only.
There is no `TextBoxSelectionOverlay` equivalent to `ImageSelectionOverlay`
for visual drag-to-reposition of floating text boxes in the body.

For anchored text boxes (`displayMode: 'float'`, `posOffsetH/V` set), a drag should:
1. Show a grab cursor + selection border on click.
2. On drag, update `posOffsetH/V` and re-trigger the layout pass.

Refs: `TextBoxExtension.ts:102`, `PagedEditor.tsx` (no TextBoxSelectionOverlay)

---

### BD-2 — Textboxes in the body have no selection affordance (no selection border)
**Status: FIXED (`4c391aa`) — existing dashed border now solidifies to blue during drag; move grip provides "selected" affordance**

Clicking a textbox in the body selects it (PM NodeSelection) but there is no visual
"selected" state (no blue border, no resize handles) because there is no
`TextBoxSelectionOverlay`. Contrast: clicking an image shows the `ImageSelectionOverlay`
with blue handles.

Fix: create `TextBoxSelectionOverlay.tsx` as a thin wrapper around the existing
`ImageSelectionOverlay` pattern, using the textbox's `posOffsetH/V` for initial position.

---

## Priority order for implementation

| ID | Description | Priority | Effort | Blocks |
|----|-------------|----------|--------|--------|
| HF-1 | Options dropdown close | DONE (`72ec2cf`) | — | — |
| HF-4 | Hover/selection affordance | DONE (`e0336da`) | — | — |
| HF-2 | Drag/move textboxes+images in HF | DONE (`e0336da`) | — | — |
| HF-3 | Resize textboxes+images in HF | DONE (`e0336da`) | — | — |
| HF-6 | Ruler disabled during HF editing | DONE (`e0336da`) | — | — |
| HF-5 | Context menu in HF editor | DONE (`e0336da`) | — | — |
| BD-1 | Body textbox drag-to-reposition | DONE (`4c391aa`) | — | — |
| BD-2 | Body textbox selection affordance | DONE (`4c391aa`) | — | — |
| HF-7 | Format panel in HF editor | P2 | L | HF-2 |

Effort: S = 1–2 hours, M = half day, L = 1–2 days

---

## Regression gates (apply to all HF work)

- 39-fixture round-trip stays pristine
- No pagination change (body page counts unchanged on fixture corpus)
- `End`-key test passing (HF overlay selection)
- Existing simple-header editing tests pass (no positioned content regression)
- VF representative-corpus unchanged

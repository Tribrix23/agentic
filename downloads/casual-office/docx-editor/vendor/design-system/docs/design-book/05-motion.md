# 05 — Motion & animation UX

Motion in Casual Office is a **wayfinding tool, not decoration**. It tells the
user where a surface came from (a panel slid from the right rail, so closing it
sends it back there), confirms that an action registered (a toast rose into
view), and softens hard cuts that would otherwise read as jank. It never asks
for attention, never blocks input, and **never touches the cell grid**.

This is a suite-wide language. The same six keyframes and three durations drive
every overlay in sheet, doc, and slides, so a panel in the doc editor enters
exactly the way a panel in the sheet editor does. Build new surfaces by reaching
for an existing `.cs-anim-*` class — do not author one-off animations.

Canonical tokens live in
[`src/tokens/motion.css`](../../src/tokens/motion.css) (keyframes + utility
classes) and [`src/tokens/spacing.css`](../../src/tokens/spacing.css) §Motion
(durations + eases). Cite those, not magic numbers.

---

## 1. The token vocabulary

### Durations — three steps, by directness of manipulation

| Token            | Value   | Use for                                                    |
| ---------------- | ------- | ---------------------------------------------------------- |
| `--motion-fast`  | `90ms`  | Direct manipulation: hovers, wells, toggles, focus rings.  |
| `--motion-base`  | `160ms` | Control state changes, selects, popovers/menus, toasts.    |
| `--motion-slow`  | `240ms` | Large-surface entrances: side panels, modal dialogs.       |

The scale climbs with the **distance and size** of the thing moving, not with
importance. A 320px panel sliding in earns `--motion-slow`; a 2px hover tint
must be `--motion-fast` or it feels laggy under the cursor.

> **Drift to fix, not to copy.** The live sheet shell at
> [`apps/web/src/styles.css:103`](../../../sheet/apps/web/src/styles.css)
> redefines `--motion-fast: 80ms` and `--motion-base: 140ms` locally — slightly
> snappier than the design-system defaults. Treat the **design-system token
> values (90/160/240) as canonical**; the shell override predates token
> centralization and should converge onto the tokens, not the reverse. Do not
> introduce new local duration overrides.

### Eases — three curves, by intent

| Token           | Curve                              | Feel / use                                              |
| --------------- | --------------------------------- | ------------------------------------------------------ |
| `--ease-out`    | `cubic-bezier(0.16, 1, 0.3, 1)`   | Decelerate-to-rest. The default for **everything** that enters or changes a hover/focus state. |
| `--ease-in-out` | `cubic-bezier(0.45, 0, 0.2, 1)`   | Symmetric. For elements that move *and come back* (a value sliding, a measured reflow). |
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.5, 1)` | Gentle overshoot (~1.4 = ~10% past target). For surfaces that should feel **placed**: menus pop, dialogs rise. |

Do: use `--ease-out` by default. The decelerating curve makes the UI feel like
it's catching up to the user — responsive, not draggy.
Don't: spring anything the user manipulates continuously (drag, resize, scroll).
Overshoot on a dragged thing reads as the UI fighting the pointer.

### Keyframes — the six entrances

From [`src/tokens/motion.css`](../../src/tokens/motion.css):

```
cs-fade-in         opacity 0→1
cs-pop-in          opacity + translateY(-4px) + scale(0.97)→1   origin: top
cs-rise-in         opacity + translateY(10px) + scale(0.985)→1
cs-slide-in-right  opacity + translateX(14px)→0
cs-slide-up        opacity + translateY(12px)→0
cs-scrim-in        opacity 0→1   (backdrop only)
```

Each is exposed as a utility class that binds duration + ease + `both` fill:

```
.cs-anim-fade   → cs-fade-in        --motion-base  --ease-out
.cs-anim-pop    → cs-pop-in         --motion-base  --ease-spring   (origin top)
.cs-anim-rise   → cs-rise-in        --motion-slow  --ease-spring
.cs-anim-panel  → cs-slide-in-right --motion-slow  --ease-out
.cs-anim-up     → cs-slide-up       --motion-base  --ease-out
.cs-anim-scrim  → cs-scrim-in       --motion-fast  --ease-out
```

Attach the class to the element that enters. The `both` fill means the element
holds the `from` state before paint, so there's no first-frame flash.

---

## 2. The hard rule: the grid/canvas is instant

**Nothing animates the cell grid.** Univer renders the spreadsheet to a
`<canvas>` that repaints on its own frame loop; the DOM doesn't move when the
sheet scrolls. Layering CSS transitions on anything anchored to a cell fights
that loop and produces visible lerp-lag.

This is already enforced and documented in code — see
[`apps/web/src/styles.css:4826`](../../../sheet/apps/web/src/styles.css):

> *Intentionally NO transition on top/left/width/height. … A CSS transition on
> top/left makes the cursor lerp from its old viewport position to the new one
> over 80 ms; during continuous scrolling, each frame's repaint starts a new
> lerp, so the cursor visually pins to the viewport instead of moving with the
> cell.*

**Must NOT animate:**

- Cell selection rectangle, fill handle, active-cell outline.
- Scroll position, row/column resize, freeze-pane shifts.
- Remote presence cursors **while tracking** a scrolling cell. (The one
  exception: `--presence-cursor--moving` eases the rectangle for a single frame
  *only when the peer's anchor cell actually changes* — a discrete jump between
  cells, never continuous tracking. styles.css:4839.)
- In-cell editing, formula autocomplete dropdown position, any value typed into
  a cell.
- Chart canvas repaint, conditional-format fills, data-bar growth.

If it lives inside the canvas viewport or is positioned relative to a cell,
it updates **per frame with zero transition**. Animation lives in the
**chrome** — the shell around the grid — and nowhere else.

---

## 3. Principles

1. **Subtle.** Travel distances are small (4–14px) and opacity does most of the
   work. The keyframes top out at `translateY(12px)`; nothing flies across the
   screen.
2. **Fast.** Nothing exceeds `--motion-slow` (240ms). A power user round-tripping
   a panel 200×/hour cannot wait on a half-second curtain. When unsure, go
   shorter.
3. **Purposeful.** Animate only to (a) show spatial origin, (b) confirm a
   discrete event, or (c) soften an abrupt appear. No idle/ambient motion in the
   work surface. (Looping spinners are status, not decoration — §5.)
4. **Interruptible.** Motion must never gate input. Overlays are clickable on
   their first frame; entrance animations run on the visual layer while the
   surface is already live. Never disable pointer events "until the animation
   finishes."
5. **Respect reduced motion.** Honor `prefers-reduced-motion` everywhere — and
   it's already wired: motion.css collapses **all six** `.cs-anim-*` classes to
   a flat `cs-fade-in 1ms` fade. Any hand-rolled transition you add must carry
   its own `@media (prefers-reduced-motion: reduce)` fallback to a ≤1ms
   opacity-only change. Transform-based entrances especially must be neutralized
   for users who get motion sick.

---

## 4. Per-surface specs

### Side panel (right rail: Charts, History, Tables, Outline, Format)

```
        ┌──────────────────────────┐──────────┐
 grid → │                          │  panel   │ ← slides in 14px from right,
        │                          │  cs-anim │   fades, decelerates to rest
        └──────────────────────────┴──────────┘
```

- **Enter:** `.cs-anim-panel` → `cs-slide-in-right`, `--motion-slow` (240ms),
  `--ease-out`. It comes from the rail edge it's docked to — the motion *is* the
  spatial story.
- **Ease:** `--ease-out`, not spring. A wide panel that overshoots looks like it
  bounced off the viewport edge.
- **Exit:** **instant — the panel unmounts, no exit keyframe.** This is the one
  surface that does *not* animate out: a reverse-slide on close lags the grid when
  a user toggles a panel rapidly, and the panel-rail authority (§04 "Panels &
  side surfaces") owns this rule. Open is the only moment a panel animates; close
  is immediate. (The "exits run a step faster than entrances" principle still
  applies to dialogs and menus below — just not to docked panels.)
- **Mutex:** swapping panels (`PanelMutex` / `PanelRail`) is a *replace*, not a
  stack. Cross-fade: outgoing fades out `--motion-fast`, incoming `.cs-anim-up`
  / fade `--motion-base`. Do not slide both — two panels translating at once
  reads as chaos.

### Dialog + scrim (FormatCells, GoalSeek, PageSetup, Properties, command search)

- **Scrim:** `.cs-anim-scrim` → `cs-scrim-in`, `--motion-fast` (90ms),
  `--ease-out`. The backdrop is the fastest thing on screen — it should be there
  before the dialog finishes rising. (Live shell uses `backdrop-in` at
  120–140ms; converge onto `--motion-fast`/`.cs-anim-scrim`.)
- **Dialog:** `.cs-anim-rise` → `cs-rise-in`, `--motion-slow` (240ms),
  `--ease-spring`. Rises 10px + scales 0.985→1 with gentle overshoot, so it
  feels *placed* center-screen, not dropped.
- **Order:** scrim first (or concurrent), dialog rides on top. Never spring the
  scrim.
- **Exit:** dialog fades + drops 6px over `--motion-base`; scrim fades
  `--motion-fast`. Focus returns to the trigger the same frame the dialog hides
  (a11y), independent of the visual fade.

### Popover / menu (MenuBar dropdowns, Toolbar wells, context menus, Popover)

```
   [ Format ▾ ]
   ┌──────────────┐  ← pops from top edge: -4px + scale 0.97→1, spring
   │ Cells…       │
   │ Rows         │
   └──────────────┘
```

- **Enter:** `.cs-anim-pop` → `cs-pop-in`, `--motion-base` (160ms),
  `--ease-spring`, `transform-origin: top`. Pops *from its anchor* — origin must
  match the trigger edge (top for a top-anchored menu; override
  `transform-origin` for menus that open upward/leftward so they grow out of the
  trigger, not toward it).
- **Exit:** instant or ≤90ms fade. Menus dismiss *now*; a slow close makes the
  next click feel stuck. Don't reverse the spring on exit.
- **Hover within an open menu:** item highlight is a `--motion-fast` background
  transition — §every interactive row in the shell already does
  `background var(--motion-fast) var(--ease-out)`.

### Toast / pill (toast stack, SaveStatusPill, ActivityPill, NamePill, BusyPill)

- **Toast enter:** `.cs-anim-up` → `cs-slide-up`, `--motion-base` (160ms),
  `--ease-out`. Rises 12px from below + fades. (Live `toast-in` is 180ms/8px;
  converge onto `.cs-anim-up`.)
- **Toast exit:** fade + 6px down over `--motion-fast`, OR auto-dismiss after its
  TTL. Stacked toasts reflow with `--motion-base` ease-out on `transform`.
- **Status pills (Save/Activity):** these mutate text/icon **in place** — they
  don't re-enter on every state change. Cross-fade the *content*
  (`--motion-fast`) and let the pill width animate with `--motion-base`
  `--ease-in-out` (it grows and shrinks, so symmetric ease). Never make a
  persistent pill slide-in on each save; it would twitch constantly.
- **Spinners (Busy/Save in-progress):** continuous `linear infinite` rotation
  (e.g. `busy-pill-spin 0.8s`, `save-status-spin`). This is allowed ambient
  motion because it communicates *ongoing work* — it's status, not flourish.
  Kill it the instant the operation resolves.

### Tab switch (SheetTabs, ribbon tab groups, panel tabs)

- **No slide, no crossfade of panes.** Switching sheets/ribbon tabs swaps
  content **instantly** — users tab-hop rapidly and any transition adds
  perceived latency and motion noise. Excel parity: instant.
- **Animate only the indicator.** The active-tab underline/background moves to
  the new tab over `--motion-base` `--ease-out` (or instant if reduced-motion).
  The *content* underneath is a hard cut.
- Tab **hover** tint: `--motion-fast` `--ease-out` background, like every other
  control.

### Micro-interactions (buttons, toggles, focus, wells)

- Hover/active background + border + color: `--motion-fast` (90ms) `--ease-out`.
  This is the single most-repeated transition in the shell — keep it uniform.
- Focus ring: appears instantly (no transition on `outline`) for keyboard
  responsiveness; a fading focus ring reads as sluggish to keyboard users.
- Skeleton/loading shimmer: `skeleton-fade --motion-base`, then a
  `loading-sweep`/`loading-spin` while pending — status motion, §toast spinners.

---

## 5. Allowed continuous motion (the only exceptions to "no idle motion")

| Pattern             | Where                          | Why it's allowed                    |
| ------------------- | ------------------------------ | ----------------------------------- |
| Spinner rotation    | BusyPill, SaveStatusPill       | Communicates ongoing async work.    |
| Loading sweep       | LoadingOverlay, skeletons      | Indeterminate progress.             |
| Collab presence pulse | CollabIndicator (`collab-pulse 1.2–1.6s`) | Signals a *live* connection. |

All three are **status indicators tied to real state** and must stop the moment
the state clears. Nothing loops "for delight."

---

## 6. Checklist for new motion

- [ ] Is the animated element in the **chrome**, not the grid/canvas/cell layer?
- [ ] Did you reuse a `.cs-anim-*` class or a `--motion-*` / `--ease-*` token
      (no raw ms, no raw cubic-beziers)?
- [ ] Duration ≤ `--motion-slow` (240ms)?
- [ ] `--ease-out` default; spring only for placed surfaces (menu/dialog); never
      spring on drag/resize/scroll?
- [ ] Surface interactive on its **first** frame (not gated on animation end)?
- [ ] `prefers-reduced-motion` collapses it to a ≤1ms opacity change?
- [ ] If it loops, is it tied to real status and does it stop on resolve?

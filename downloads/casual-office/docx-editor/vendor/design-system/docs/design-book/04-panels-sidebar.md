# 04 — Panels & side surfaces

Scope: the docked side-panel / rail system for the Casual Office suite, worked
through the **Sheet** editor where it is most fully built. Doc and Slides reuse
the same rail + panel chrome; differences are flagged inline.

This is a target spec grounded in what already ships. The real surfaces it
describes and refines:

- Rail — `apps/web/src/shell/PanelRail.tsx`, styles at `apps/web/src/styles.css:1542`.
- Single-occupant coordination — `apps/web/src/shell/PanelMutex.tsx`.
- Concrete panels — `ChartsPanel.tsx`, `TablesPanel.tsx`, `OutlinePanel.tsx`,
  `HistoryPanel.tsx`, `VersionHistoryPanel.tsx` (all under `apps/web/src/shell/`).
- Modal escape hatch — `Dialog.tsx`; anchored escape hatch — `Popover.tsx`.

Tokens are cited by name from `design-system/src/tokens/*`. Do not invent new
values; everything below resolves to existing tokens.

---

## 1. The three surface tiers — pick one

There are exactly three ways to put secondary UI on screen. Choosing wrong is
the most common chrome mistake, so decide by **lifetime** and **relationship to
the grid**, not by how much content you have.

| Surface | Token chrome | Lifetime | Blocks the grid? | Use when |
|---|---|---|---|---|
| **Docked side panel** | `--color-surface-alt`, left hairline `--color-divider`, slides from right edge | Persistent — stays open across selections, sheet switches, edits | No. Grid keeps full interactivity beside it | The content is an ongoing companion to editing: a live list, an object inspector, a thread, a timeline |
| **Dialog (modal)** | `--color-surface-raised`, `--color-scrim` backdrop, `--shadow-4`, `--radius-xl` | Transactional — open, complete one task, close | Yes, fully (focus trap + body-scroll lock) | A discrete decision with a commit/cancel: Insert Chart, Format Cells, Page Setup, Goal Seek, Name Manager |
| **Popover (anchored)** | `--color-surface-raised`, `--shadow-2`, `--radius-lg`, anchored under trigger | Ephemeral — dismisses on outside click / Escape / pick | No | A quick pick or menu tied to a specific control: borders dropdown, number-format menu, File menu |

### Decision rules

**Do** use a docked panel when the user will glance at it repeatedly while
editing — Charts, Tables, Comments, History. The defining test: *does the user
want the grid and this content visible at the same time, for more than one
action?* If yes, it is a panel.

**Don't** put a one-shot, must-decide-now task in a panel. Inserting a chart is
a transaction (choose range, choose type, confirm) → that is `InsertChartDialog`,
launched *from* the Charts panel. The panel is the persistent home; the dialog
is the momentary tool. Note how `ChartsPanel.tsx` does exactly this: it owns the
list, and `setShowInsert(true)` opens a `Dialog`-class modal over it.

**Don't** stack a popover's worth of content into a panel, or a panel's worth
into a popover. A popover that needs a scrollbar is usually a panel; a panel with
three controls and no list is usually a popover or an inline well.

**Never** open two docked panels at once. The right edge holds **one** panel
body. This is enforced — see §3.

---

## 2. Anatomy of a docked panel

```
 grid                          panel body            rail
┌───────────────────────────┬──────────────────┬────┐
│                           │ ▣ Charts      ✕ │ ▤ │  ← header (zone 0 tint)
│                           ├──────────────────┤ ▥ │
│        grid stays         │ ▸ Q1 Revenue     │ ▦ │  ← scrolling list (flex:1)
│        fully live         │   Column · A1:D8 │ ▧ │
│                           │ ▸ Costs          │ ▨ │
│                           │   ────────────── │    │
│                           │ [ + Insert chart]│    │  ← pinned footer / CTA
└───────────────────────────┴──────────────────┴────┘
                            320px fixed         36px
```

### Width

- **320px fixed** for list/inspector panels (`.tables-panel`, `.side-panel`,
  `.charts-panel`, `.outline-panel` all set `flex: 0 0 320px`). This is the
  suite default. Do not vary it per panel — a constant width is what makes the
  right edge feel like one slot that swaps contents.
- The panel uses `flex: 0 0 320px` so it never steals grid width elastically;
  the grid (`flex: 1`, `min-width: 0`) absorbs the remainder and Univer's canvas
  reflows. Below ~720px (see `@media` breakpoints in `styles.css`) panels go
  full-bleed over the grid rather than squeezing it; on phone they are a viewer
  concern only (CLAUDE.md mobile scope).
- **Resize is deferred, not designed-in.** Today width is constant. If/when a
  panel earns resize (the pivot field list is the likely first), the spec is: a
  3px hit-target grab handle on the panel's left hairline, drag clamps to
  `[280px, 480px]`, the chosen width persists per-panel (see §5), and the handle
  shows `cursor: col-resize` + an accent hairline on hover. Until then, do not
  add resize to a panel just because it has long content — fix the content
  density first.

### Header

Two header conventions exist in the codebase and they should converge on the
`.side-panel__header` form, because it carries an icon and reads as a titled
surface:

```
[ icon 16 ]  Title              ( count )   [ ✕ ]
```

- Left: a Material Symbols Outlined glyph at `size="sm"` (16px), matching the
  rail icon for that panel so the eye links rail → open panel.
- Title: `--text-sm`, `font-weight: 600`, on `--color-surface` (zone 0) so the
  header reads as a lid one zone brighter than the `--color-surface-alt` body.
- Optional count chip: pill (`--radius-pill`), `--color-surface-strip` fill,
  `--text-xs`, `--color-text-secondary` — used by History (`history-count`).
  Use it for "how many items" affordances (charts, tables, comments). Numbers
  are JetBrains Mono tabular per the type system.
- Right: a single icon close button, `aria-label` always set
  ("Close charts panel"). Close mirrors the rail toggle — clicking the rail
  button again also closes (`ui.toggleChartsPanel`).

**Do** keep the header to one row, 40–44px tall (`padding: 10px 12px`).
**Don't** add a toolbar row of actions to the header; per-row actions belong on
the rows (the delete/theme controls in `TablesPanel`), and panel-wide actions
belong in the pinned footer CTA.

### Body & scroll

- The body is the only scroll region: `flex: 1; min-height: 0; overflow-y: auto`.
  The header and any footer CTA stay pinned; only the list scrolls. This is the
  rule that keeps "Insert chart" reachable no matter how long the list grows.
- **Empty state is mandatory and instructive**, never a blank panel. The pattern
  (see `ChartsPanel.tsx` / `TablesPanel.tsx` empty blocks): a large muted icon,
  a one-line title ("No charts on this sheet"), one sentence telling the user how
  to make the first one ("Select the data range… or use Insert → Chart"), and
  the primary CTA button. `--color-text-secondary`, centered, `--text-xs`,
  generous `padding: 24px 16px`.
- Rows: `--text-xs`/`--text-sm`, hairline `--color-divider` between rows, hover
  tint `--color-hover`. Inline rename uses a click-to-edit input that commits on
  Enter/blur and cancels on Escape — already the pattern in both Charts and
  Tables. Keep it; it is faster than a rename dialog and matches Excel's
  in-place name editing.

### Footer / CTA

When a panel has a primary creation action, pin it. Charts uses an `add-row`
list item with a `btn-secondary`; the empty state promotes the same action to
`btn-primary`. Rule: **primary in the empty state** (it is the only thing to do),
**secondary once a list exists** (creation is now one of several actions).

---

## 3. The panel rail

The rail is the always-visible vertical strip of toggle buttons on the far right
edge (`PanelRail.tsx`, `.panel-rail`). It is the suite's activity bar — the
single discoverable home for every docked surface.

```
┌────┐
│ ▤  │  Tables
│ ▦  │  Charts
│ ▥  │  Outline
│ ▨  │  Comments
│ ▧  │  History
└────┘
 36px
```

### Behavior

- **Fixed 36px, never collapses.** Even with every panel closed the rail stays,
  so re-opening is one click and never a menu hunt (`PanelRail.tsx` header
  comment states this intent). This is why panel toggles were *removed* from the
  toolbar — one home, no duplication.
- Buttons are 32×32, icon-only, `--color-text-secondary` at rest → `--color-text`
  on `--color-hover`.
- **Active state** is unmistakable: `--color-accent` icon, `--color-accent-soft`
  fill, and a 2px `--color-accent` marker on the button's **left** edge
  (`.panel-rail__btn--active::before`) — the VSCode / Office activity-bar
  convention, pointing at the panel body it opened.
- `aria-pressed` reflects open/closed for every React-owned panel. The one
  exception is Comments, which Univer owns internally; until we subscribe to
  Univer's UI service it shows no pressed state (known follow-up, noted in
  `PanelRail.tsx`). New panels we own must always wire `aria-pressed`.
- Focus ring: `outline: 2px solid var(--color-accent)` inset.

### Ordering

Group by relationship to the data, top to bottom: **object panels** (Tables,
Charts, Outline) first, then **collaboration** (Comments), then **time**
(History) last. Keep History pinned to the bottom — it is the "look backward"
affordance and reads naturally as the floor of the stack.

### Single-occupant invariant

Only one panel body may occupy the right edge. The hard part is that there are
**two panel systems** — our React panels and Univer's own `ISidebarService`
sidebar (Comments today; data-validation, conditional-format popups later).
`PanelMutex.tsx` reconciles them two ways:

1. When any React panel becomes visible → `sidebarService.close()` dismisses any
   open Univer sidebar.
2. When Univer's `sidebarOptions$` emits `visible: true` (rising edge only, to
   avoid the self-echo) → `ui.closeAllReactPanels()`.

Any new docked surface **must** route through this mutex, or the user gets two
stacked sidebars fighting for the same 320px. Do not add a panel that renders to
the right edge without registering it in the mutex's `anyReactPanelOpen` union.

---

## 4. Motion & feel

One motion vocabulary, defined in `tokens/motion.css`. Panels do not get bespoke
animation.

- **Enter:** `.cs-anim-panel` → `cs-slide-in-right` over `--motion-slow` (240ms)
  on `--ease-out`. The body glides 14px in from the right edge while fading in —
  it reads as *arriving from the edge it lives on*, not popping into the middle.
- **Exit:** there is no separate exit keyframe; panels unmount. Keep it that way
  — a 240ms reverse-slide on close makes the grid feel laggy when a user is
  toggling quickly. Close is instant; open is the only moment that animates.
- **Reduced motion:** the `@media (prefers-reduced-motion: reduce)` block
  collapses every entrance to a 1ms fade. Inherit it; never hand-roll a
  transition that ignores it.
- **Contrast with the other tiers:** dialogs *rise* (`.cs-anim-rise`, 240ms,
  `--ease-spring` overshoot — they feel placed in the center over a
  `--color-scrim`); popovers *pop* (`.cs-anim-pop`, `--motion-base`, spring,
  `transform-origin: top` from the anchor). Three distinct entrances = the user
  subconsciously knows "edge companion" vs "blocking task" vs "quick pick"
  before reading a word.

### Focus handling

- **Panels do not trap focus** and do not move focus on open. The grid is still
  the primary surface; stealing focus to a panel on every toggle would interrupt
  editing. Opening a panel via the rail leaves the cell selection intact.
  Exception: when a panel opens *expressly to act* (e.g. an inline rename input
  the user just triggered), `autoFocus` that specific control — as Charts/Tables
  do for the rename `<input>`.
- **Dialogs do trap focus** — full WAI-ARIA dialog pattern in `Dialog.tsx`:
  remember the opener, lock body scroll (compensating scrollbar width so the
  grid doesn't shift), cycle Tab within the dialog, focus the first focusable on
  open, and **restore focus to the opener on close**. This is the contract that
  separates a modal from a panel: a panel shares focus with the grid; a dialog
  owns it.
- **Popovers** close on outside `pointerdown` (capture phase — Univer's canvas
  `stopPropagation`s mousedown, so a bubble listener never fires) and on Escape;
  they portal to `<body>` to escape stacking contexts. New ephemeral surfaces
  must copy this capture-phase dismissal or they will not close on grid clicks.

---

## 5. Open/close & persistence

- **Toggle, don't stack.** Rail click opens; rail click again (or header ✕)
  closes. Opening panel B while A is open closes A — the mutex guarantees one
  occupant, so the user never closes A manually first.
- **Persist the last-open panel per document, per user.** Target behavior: the
  rail remembers which panel (if any) was open when the user left a file and
  restores it on reopen, scoped to that file (a chart-heavy workbook reopens with
  Charts; a reviewed doc reopens with Comments). Mirror the existing
  `use-statbar-prefs.ts` pattern (localStorage-backed UI prefs) rather than
  inventing a store. Do not persist *scroll position* inside a panel — lists are
  live (charts/tables/history rebuild from the model) and a stale offset is
  worse than top.
- **Sheet/selection switches keep the panel open** but re-scope its contents.
  Charts and Tables filter to the active sheet (`activeSheetId`) — switching tabs
  swaps the list, it does not close the panel. This is Excel's Selection-Pane
  behavior and the bar to hold.

---

## 6. The concrete panels

Each is a 320px docked panel using the chrome above. Listed with its job, its
row shape, and the dialog it hands off to.

### Charts — `ChartsPanel.tsx`
Excel's **Selection Pane scoped to charts** on the active sheet. Rows: family
icon + click-to-rename name, a type label + clickable source-range badge
(`A1:D8`) that flashes the range in the grid, and a delete button. Empty state +
footer both route to `InsertChartDialog` (the transaction). Header should adopt
the `.side-panel__header` icon+count form (`analytics` glyph).

### Tables — `TablesPanel.tsx`
Lists structured tables on the active sheet. Rows: inline-rename name, A1 range,
a **theme swatch group** (radio-style `aria-pressed` color chips — keep this; it
is faster than a theme dropdown), and delete. Creation is "Format selection as
Table" via the busy-runner (`busy.runBusy`), not a dialog, because the only input
is the current selection. Rename validates through Univer's table plugin and
must `await ensurePluginByName('table')` before calling (lazy-plugin gotcha
documented in the file).

### Outline (groups) — `OutlinePanel.tsx`
Row/column grouping levels. **Sectioned panel** pattern (`.outline-panel__section`
with section titles) — the one place a panel body subdivides. Use section
headers, not tabs, when a panel shows two *coexisting* lists (rows + columns);
use tabs only when the lists are alternatives (see History).

### History — `HistoryPanel.tsx` / `VersionHistoryPanel.tsx`
The composed case. `VersionHistoryPanel` is a **two-tab** panel
(`role="tablist"`): **Versions** (snapshot list grouped by day, click-to-preview
in the grid with a Restore/Cancel banner, rename/delete on manual entries) and
**Activity** (the per-mutation feed from `HistoryPanel`). This is the canonical
example of *tabs inside a panel*: two views of "the past" that the user toggles
between, never sees together. Rows are dense 3-row grids (`who / when / what` +
a Revert action). The pinned header carries the `history` glyph; tabs sit
directly under it, body scrolls below.

Tabs-in-panel rules: use the `role="tablist"` strip directly under the header,
2 tabs ideal and 3 max, `aria-selected` drives the active underline. More than 3
alternatives means it should be a panel switch (rail), not in-panel tabs.

### Comments / threads — Univer sidebar
Owned by Univer's `ISidebarService`, opened from the rail's `forum` entry via
`toggleCommentPanel(api)`. It must read as one of *our* panels: the
`.grid-host [data-u-comp='sidebar']` overrides retint it to `--color-surface-alt`
body + zone-0 header + left hairline so it is visually indistinguishable from a
React panel. It participates in the mutex (§3). Outstanding gap: no rail
pressed-state yet (Univer owns its visibility). When we close that gap, subscribe
to `sidebarOptions$` and feed `aria-pressed` like every other rail button.

### Properties / inspector
The object-properties surface (chart format, cell format) is currently a
**dialog** (`PropertiesDialog.tsx`, `FormatCellsDialog.tsx`, the chart Format
dialog) — correct while editing is a discrete "open → adjust → confirm" task.
The *target* for the chart inspector specifically is to graduate to a **docked
properties panel** when a chart is selected (Excel's "Format Chart Area" task
pane), because chart styling is iterative and benefits from live grid visibility.
That panel would: open on chart-select, re-scope to the selected object, close on
deselect, and live in the same right-edge slot under the mutex. Until that ships,
keep formatting in dialogs — do **not** build a half-panel that floats outside
the rail system.

---

## 7. Don't list (suite-wide)

- **Don't** float free-positioned/draggable panels. Every docked surface lives in
  the fixed right-edge slot; the rail is the only entry point.
- **Don't** open a panel on top of the grid with a scrim. Scrims belong to
  dialogs only (`--color-scrim`). A panel that dims the grid is a dialog wearing
  the wrong clothes.
- **Don't** let two right-edge surfaces coexist — route through `PanelMutex`.
- **Don't** vary panel width per panel (320px is the slot) or animate panel close.
- **Don't** ship a blank empty state — icon + one-line how-to + CTA, always.
- **Don't** steal grid focus on panel open; do trap focus in dialogs and restore
  it on close.
- **Don't** reach for a new color/radius/motion value — if a panel "needs" one,
  it is using the wrong surface tier.

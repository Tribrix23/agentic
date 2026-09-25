# 06 — Interaction & behavior

How the Casual Office suite *behaves*. This chapter defines the behavioral contracts
users can rely on: the selection and keyboard models, focus management, the canonical
control states, the feedback surfaces, and the command surfaces. The spreadsheet
editor (Casual Sheets) is the worked example because it carries the densest interaction
load; the doc and slides editors inherit the same chrome contracts and feedback
language, and diverge only where their content model demands it (noted inline).

The bar is **Microsoft Excel / Office** for the sheet (selection, keyboard, formula bar,
file-centric flow) and **Google Docs** for the doc editor. We match muscle memory before
we add anything novel. Every value below cites a real token
(`/Users/sachin/Desktop/melp/services/design-system/src/tokens/*`) or real shell
behavior (`/Users/sachin/Desktop/melp/services/sheet/apps/web/src/shell/*`). Do not
invent a parallel system.

---

## 1. First principles

1. **Direct manipulation is instant; chrome eases.** Selection, typing, scroll, and
   cell commit must feel zero-latency — they run on `--motion-fast: 90ms` or no
   animation at all. Overlays (menus, dialogs, panels, toasts) ease in on
   `--motion-base: 160ms` / `--motion-slow: 240ms` so they feel *placed*, not popped.
   Never animate the grid's response to a keystroke.
2. **The keyboard is the primary input.** Every action reachable by mouse must have a
   keyboard path, and that path must match Excel/Office where one exists. The mouse is
   the discovery surface; the keyboard is the speed surface.
3. **State is always legible, never loud.** Status lives in quiet pills and the status
   bar, not in modal interruptions. We confirm transitions (toasts) and persist
   failures (activity log) — we do not nag about steady state.
4. **One vocabulary of motion and state.** A hover feels the same on a toolbar button,
   a menu item, and a sheet tab. A disabled control looks disabled everywhere. This is a
   contract, not a coincidence.

---

## 2. Selection model (sheet)

The grid is canvas-rendered by Univer; it owns its own hit-testing and gesture handling.
Do not wrap or intercept its pointer events — extend behavior through the facade and the
command bus instead. What the suite *guarantees* about selection:

- **One active cell, one selection range** (or multiple non-adjacent ranges in
  add-to-selection mode). The active cell is the keyboard anchor — the cell that edits on
  type, the corner that `Shift+Arrow` grows from. It is visually distinct from the rest of
  the selection (filled marquee vs. the active cell's open border), matching Excel.
- **Selection fill** uses `--color-selected` (teal at 11% alpha) with
  `--color-selected-strong` (20%) for the active-cell well and headers. Because these are
  translucent, they compose correctly over banded rows, conditional-format fills, and the
  dark theme without a separate palette.
- **Add-to-selection mode** (Excel's `Shift+F8` / Ctrl-drag) is a sticky, announced
  state. When active, the formula bar renders an **"Add to Selection"** chip
  (`formula-bar__selection-mode`, see `FormulaBar.tsx:519`). Sticky modes must always show
  a visible indicator — never leave the user guessing whether the next click extends or
  replaces.
- **Multi-cell selections announce their shape.** The formula bar shows `{rows}R × {cols}C`
  (`FormulaBar.tsx:528`) the instant a range spans more than one cell, and the status bar
  computes Sum / Average / Count for numeric selections. These are read-only telemetry —
  they never steal focus.

```
 NameBox    [Add to Selection]  [3R × 2C]   × ✓ fx   =SUM(A1:A3)__________________
 └ A1                                                  └ formula input (draft)
```

**Do:** keep selection feedback in the canvas + formula bar + status bar.
**Don't:** pop a toast or dialog on selection change. Selection is high-frequency; any
overlay on it is noise.

For the doc editor, "selection" is a text range (caret + extent), and the equivalent
telemetry is word/character count in the status bar. For slides it is the set of
selected shapes on the active slide. The *contract* — one anchor, a visible extent,
quiet telemetry — is shared.

---

## 3. Keyboard model — Excel parity (sheet)

This is the load-bearing section. The canonical shortcut list lives in
`KeyboardShortcutsDialog.tsx` and is the single source of truth users see; every binding
there must actually work. Shortcuts are stored in canonical `Ctrl+<key>` form and
rendered per-platform through `formatShortcut(combo, navigator.platform)` so Mac users
see `⌘`/`⌥` and Windows/Linux users see `Ctrl`/`Alt` — the menu, the cheat sheet, and
the command palette all agree because they share that one util.

### 3.1 Grid navigation (canvas-focused, not editing)

| Key | Behavior |
| --- | --- |
| Arrows | Move active cell by one |
| `Ctrl+Arrow` | Jump to edge of data block |
| `Tab` / `Shift+Tab` | Move right / left; wraps within a selected range |
| `Enter` / `Shift+Enter` | Move down / up; within a range, walks the range column-major |
| `Ctrl+Home` / `Ctrl+End` | Top-left / last used cell |
| `Ctrl+Space` / `Shift+Space` | Select column / row |
| `Ctrl+PageUp` / `Ctrl+PageDown` | Previous / next sheet tab |
| `F2` | Enter in-cell edit at end of content |
| Any printable char | Begin replace-edit on the active cell |

These run through Univer's command bus; we do not re-bind them in the shell unless Univer's
default diverges from Excel. When it does (e.g. `F4`), we intercept — see 3.3.

### 3.2 The formula-bar editing contract

The formula bar (`FormulaBar.tsx`) is the precise Excel surface. Its commit/cancel
behavior is a hard contract:

| Key | Behavior (mid-edit) |
| --- | --- |
| `Enter` | Commit, move **down** (`commit('down')`, `FormulaBar.tsx:498`) |
| `Shift+Enter` | Commit, move **up** |
| `Tab` | Commit, move **right** (`FormulaBar.tsx:502`) — we `preventDefault` so the browser focus trap can't steal it |
| `Shift+Tab` | Commit, move **left** |
| `Escape` | **Revert** to the pre-edit value, restore origin cell (`revert()`, `FormulaBar.tsx:509`) |
| `F2` | Toggle between edit-in-cell and formula-bar editing |

After any commit/cancel, the input **blurs back to the grid** (`inputRef.current?.blur()`)
so the next keystroke navigates rather than types. This blur-on-commit is the difference
between feeling like Excel and feeling like a web form — honor it.

**Formula authoring** layers on top:

- **Range picker.** While the draft starts with `=`, clicking a cell or a sheet tab
  *inserts a reference at the caret* instead of committing (`isFormulaEdit`,
  `FormulaBar.tsx:70`). The origin cell+sheet is captured up front so `Enter` always
  commits back to where editing began, even after the user has clicked across other
  sheets. Dragging a new range **replaces** the just-inserted ref in place
  (`lastPickRangeRef`, `FormulaBar.tsx:189`) — matching Excel's drag-to-update, not
  concatenate-every-click.
- **`F4` cycles absolute/relative** on the reference under the caret
  (`A1 → $A$1 → A$1 → $A1`, `cycleAbsoluteRefAtCaret`, `FormulaBar.tsx:477`). We must call
  `e.nativeEvent.stopImmediatePropagation()` here because Univer 0.25 binds `F4` to
  Repeat-Last-Action at document level; React's synthetic `stopPropagation` does not reach
  Univer's native listener. This is the canonical pattern for "the app overrides a Univer
  default for Excel parity."
- **Autocomplete.** Typing `=SU` opens a suggestion list mixing function names (insert
  `NAME(`) and sheet names (insert `Name!`). `ArrowUp`/`ArrowDown` move; `Tab`/`Enter`
  (without Shift) **accept** the highlighted suggestion rather than committing the cell;
  `Shift+Tab`/`Shift+Enter` still commit-and-navigate; `Escape` closes the list without
  reverting the draft (`FormulaBar.tsx:448`). The two-stage `Escape` (close list, then
  revert) mirrors Excel.

**Do:** intercept a Univer binding only when it diverges from Excel, and document why
inline (as `F4` does).
**Don't:** capture editing changes off DOM/UI events. Per project rules, real edits flow
through the command bus; the formula bar drives the background cell editor, not a parallel
state.

### 3.3 The `Ctrl`-combo set

The cheat sheet groups bindings the way users chunk them — Essentials, Editing,
Navigation, Formatting, View. The high-traffic ones the suite must never break:
`Ctrl+S` (save), `Ctrl+Z`/`Ctrl+Y` (undo/redo), `Ctrl+C`/`X`/`V` and
`Ctrl+Shift+V` (paste values) / `Ctrl+Alt+V` (paste special), `Ctrl+1` (Format Cells),
` Ctrl+\`` (toggle formula view), `Ctrl+E` (Flash Fill), `Ctrl+F` (Find & Replace).

The doc editor remaps this set to Google Docs conventions (e.g. `Ctrl+\` clears
formatting, `Ctrl+Shift+V` pastes without formatting) — same *keys*, content-appropriate
*actions*. Keep the cheat-sheet groups identical across editors so the dialog reads the
same everywhere.

---

## 4. Focus management

Focus is a first-class, visible thing — never a guess.

- **Focus ring.** `:focus-visible` draws `2px solid var(--color-focus-ring)` (the teal
  accent `#0e7490`) with `1px` offset and `--radius-sm` corners
  (`styles.css:248`). `:focus` *without* `:focus-visible` shows **no** outline
  (`styles.css:244`) — so mouse users don't see rings, keyboard users always do. This is a
  contract: rely on `:focus-visible`, never raw `:focus`, for ring styling.
- **The grid is the resting focus.** After any committed edit, dismissed dialog, or
  accepted command, focus returns to the canvas so the next keystroke is a navigation
  keystroke. Overlays that grab focus must give it back to the grid, not the body.
- **Dialogs trap focus** and restore it to the trigger on close. They auto-focus the
  primary input on open (the command palette selects its search text:
  `CommandSearchDialog.tsx:23`).
- **Popovers and menus close on outside-click and `Escape`**, and `Escape` returns focus
  to the trigger. The ActivityPill is the reference implementation: it wires both an
  outside `mousedown` listener and an `Escape` keydown, torn down when closed
  (`ActivityPill.tsx:20`). Every transient overlay must do the same.
- **Roving focus in menus.** The menu bar is `role="menubar"`; open menus are
  `role="menu"` with `role="menuitem"` children and `aria-haspopup="menu"` on submenus
  (`MenuBar.tsx:2046`, `:2331`). Arrow keys move within a menu, `Escape` closes one level,
  and focus follows the highlighted item. Mouse hover and keyboard highlight share one
  active-item concept (as the command palette does — `onMouseEnter` sets the same
  `activeIndex` the arrows drive: `CommandSearchDialog.tsx:97`).

**iOS focus note:** any text input inside the chrome must be ≥16px font-size to prevent
Safari focus-zoom (per project mobile rules). Honor this on the formula bar, name box, and
all dialog inputs.

---

## 5. Control states

Every interactive control resolves to one of these states, styled from shared tokens so
the whole product agrees. Reference: `.btn` rules at `styles.css:1200`.

| State | Token / treatment | Notes |
| --- | --- | --- |
| **Rest** | surface + `--color-text` | hairline border only where structure needs it |
| **Hover** | `background: var(--color-hover)` (slate @ 4.5%) | translucent so it composes on any zone; `--motion-fast` |
| **Active / pressed** | `background: var(--color-pressed)` (@9%) | immediate, no overshoot |
| **Selected / on** | `aria-pressed='true'` → `--color-selected` well | toggles (Bold, formula view) reflect state via `aria-pressed`, not a separate class |
| **Focus-visible** | teal `2px` ring (see §4) | keyboard only |
| **Disabled** | `color: var(--color-text-disabled)`, `cursor: not-allowed`, no hover/active (`:not(:disabled)` guards) | `styles.css:1208`. Prefer real `disabled`; use `aria-disabled` only when the element must stay focusable to explain *why* |

### 5.1 Loading

- **Inline / scoped:** a small spinner inside the affected control — e.g. the SaveStatusPill's
  10px `currentColor` ring spinning at `800ms linear` (`SaveStatusPill.tsx:72`). Use this for
  per-action work that has a home in the chrome.
- **Document-level:** `LoadingOverlay` for open/import/export — a scrim
  (`--color-scrim`) plus centered status. Reserve full-screen blocking for work that truly
  blocks all interaction (opening a workbook). Do not block the whole UI for a single-cell
  save.
- **Skeletons** for list/file-picker loads (the `/home` picker), not spinners — content
  shape should be predictable before data arrives.

### 5.2 Empty

Empty states are first-class, never a blank pane. Pattern: one calm line of guidance + the
single most likely action. The command palette's empty result is the minimal reference —
"No matching commands." (`CommandSearchDialog.tsx:87`). A new/empty workbook still shows the
full grid (the canvas is never empty); empty applies to *panels and pickers*, not the grid.

### 5.3 Error (control-level)

A control that fails shows the failure where the user was looking (the SaveStatusPill flips
to "Save failed" with the underlying message as its `title`), and the failure is mirrored to
the persistent activity log (see §6). A failed control returns to an actionable rest state —
never a dead or ambiguous one.

---

## 6. Feedback surfaces

Three tiers, by *lifetime* of the thing being communicated. The dividing rule
(`toast-context.tsx:12`): **toasts are for state *transitions*; banners are for *state*;
the activity log is for *failures that outlive their toast*.**

### 6.1 Toasts — transient transitions

`ToastProvider` (`toast/toast-context.tsx`). Three kinds — `info` / `success` / `error` —
entering with `.cs-anim-up` (slide-up, `--motion-base`). Auto-dismiss: **3.5s** for
info/success, **6s** for error (longer read time). Use for "Saved to budget.xlsx",
"Copied", "Could not export". At most one optional action button, used sparingly — if the
user *must* act, use a dialog or banner instead.

Every `error` toast auto-bridges to the activity log via a `cd:activity-error` window event
(`toast-context.tsx:141`) so the failure survives the 6s window. Call sites stay unaware of
the activity layer — they just call `toast.error(...)`.

**Do:** `toast.success('Saved to budget.xlsx')` after a discrete, completed action.
**Don't:** toast steady state ("you are offline" is a banner), and don't stack toasts for
high-frequency events.

### 6.2 The save-status pill — ambient save state

`SaveStatusPill` (`SaveStatusPill.tsx`) lives in the title bar and is the Google-Docs /
Word-online "Saved 2 min ago" surface. State machine (`save-status-context.tsx:28`):

```
 idle ──markSaving──▶ saving ──markSaved──▶ saved ──markDirty──▶ idle
                          └────markError──▶ error
```

- `idle` renders **nothing** — no clutter when there's nothing to say.
- `saving` → "Saving…" + spinner, neutral tone.
- `saved` → "Saved just now / 2 min ago" (relative time re-ticks every **30s**,
  `SaveStatusPill.tsx:21`), success tone, full timestamp in `title`.
- `error` → "Save failed", danger tone, message in `title`.
- `markDirty` knocks `saved`/`error` back to `idle` the moment the user edits — the pill
  must never lie about "Saved 1 hour ago" while the user is mid-typing. It is a no-op during
  `saving` (let the in-flight save settle on its own outcome).

It carries `role="status"` / `aria-live="polite"` so screen readers hear save transitions
without being interrupted. (Color values in the current pill are hard-coded; the target is
to drive tone from `--color-success` / `--color-danger` / `--color-text-secondary` so it
follows the theme — fix when touched.)

### 6.3 The activity pill — persistent failure log

`ActivityPill` (`ActivityPill.tsx`) — a title-bar bug-report icon that appears **only when
there are entries** (`entries.length === 0 → null`, `:36`). An unread count rides as a red
badge (`9+` cap). Click opens a popover listing recent errors with per-row Dismiss and a
"Clear all" footer; opening marks all read. This is where errors go to be *reviewed* after
their toast has vanished. Closes on outside-click and `Escape`.

The contract: a transient failure shows once as a toast, then quietly accrues here. The
title bar stays clean until something has actually gone wrong.

### 6.4 Banners — persistent mode/state

For conditions, not events: offline, view-only, preview, autosave-restore, self-host
notice. Banners sit below the chrome, are dismissible only when the state is dismissible,
and use the semantic soft fills (`--color-warning-soft`, `--color-info-soft`). Never
express an ongoing state as a toast.

```
 toast    ┊ "Copied" / "Save failed"          ┊ 3.5–6s, slides up, then gone
 pill     ┊ "Saving…" → "Saved 2 min ago"      ┊ ambient, ticks, self-clears on edit
 activity ┊ accumulated errors, badge + popover ┊ persists until dismissed
 banner   ┊ "You are offline" / "Preview"       ┊ persists while the state holds
```

---

## 7. Command surfaces

Three ways to reach a command; all resolve to the *same* underlying actions and the *same*
shortcut rendering.

### 7.1 Menu bar

`role="menubar"` (`MenuBar.tsx:2046`) — the canonical, discoverable home for the full
command long-tail (the cheat sheet deliberately covers only the common set; the menu is
exhaustive). Office-style top-level menus, each `role="menu"` with arrow-key roving focus,
`Escape` to close a level, and right-aligned shortcut hints rendered through
`formatShortcut`. Hover and keyboard highlight share one active item.

### 7.2 Right-click context menu

The grid's context menu is Univer-owned and extended via `extendContextMenu`
(`UniverSheet.tsx:82`) — cut/copy/paste, insert/delete row-col, format, etc. The shell can
*open it from the keyboard* on the active cell (`openContextMenuForActiveCell`,
`MenuBar.tsx:216`) by computing the cell's screen rect and synthesizing the pointer +
`contextmenu` events on the canvas — so context actions have a keyboard path even though
the canvas owns the gesture. Sheet tabs have their own `TabContextMenu`
(`SheetTabs.tsx:403`) for rename / color / duplicate / delete. **Do not** build a parallel
HTML context menu over the grid; extend Univer's.

### 7.3 Command palette / Tell Me

`CommandSearchDialog` (`CommandSearchDialog.tsx`), titled **"Tell Me"** after the Office
affordance. Two entry chords, both bound in `MenuBar.tsx:795`:

- **`Alt+Q`** — the Office "Tell Me" chord (the more discoverable one, surfaced in the
  menu).
- **`Ctrl+Shift+P`** — the VS Code / Linear / Notion command-palette convention, for users
  who reach for that muscle memory.

It is fed by flattening the menu tree (`collectCommandSearchItems`, `MenuBar.tsx:306`), so
the palette and the menus can never drift — every menu command is searchable, showing its
menu path and shortcut. Interaction contract: auto-focus + select the query on open;
`ArrowUp`/`ArrowDown` (and `Home`/`End`) move; `Enter` runs the highlighted item; `Escape`
closes; hover and keyboard share one `activeIndex`; empty query shows everything; no match
shows the empty state. After running, it closes and returns focus to the grid.

The doc/slides editors mount the same dialog against their own flattened menu trees — same
chords, same interaction, different command set.

---

## 8. Behavioral contracts (the short list)

A user, having learned the app once, can rely on all of these everywhere:

1. **Enter commits and moves down; Tab commits and moves right; Escape reverts.** Always,
   in the formula bar and in-cell.
2. **Escape closes the topmost transient layer** (suggestion list → menu → dialog →
   popover) and returns focus to where it came from.
3. **Keyboard focus is always visibly ringed** in teal; mouse focus is not.
4. **A completed action confirms via toast; an ongoing state shows via pill or banner; a
   failure persists in the activity log.** Never the wrong tier.
5. **The save pill never lies** — it self-clears to idle the instant you edit.
6. **Every menu command is reachable from the palette**, and every shortcut renders for
   your platform.
7. **Sticky modes are always indicated** (Add to Selection chip, view-only banner) —
   there is no invisible mode.
8. **The grid is the resting focus.** After any chrome interaction, the next keystroke
   navigates the sheet.
9. **Disabled means disabled everywhere** — same dimming, same `not-allowed`, no hover
   response.
10. **Direct manipulation is instant; chrome eases** on the shared motion tokens. Nothing
    in the grid waits on an animation.

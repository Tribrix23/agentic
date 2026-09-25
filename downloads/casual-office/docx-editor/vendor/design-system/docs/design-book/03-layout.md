# 03 — Layout grammar

How the editor shell is composed top-to-bottom: a fixed stack of chrome strips
bracketing one elastic content surface. This section defines the proportions,
the alignment grid, the content-first principle, and the responsive floor. It
is grounded in the real shell — `apps/web/src/shell/*` and `apps/web/src/styles.css`
— and the chrome-height + spacing tokens in
`design-system/src/tokens/spacing.css`. SHEET is the worked example; doc and
slides reuse the same grammar with different middle rows (noted at the end).

---

## 1. The shell is a single CSS grid, not a stack of `flex` containers

The whole editor is one named-area grid on `.app`
(`apps/web/src/styles.css:310`). Every chrome strip is a fixed-height track; the
grid (canvas) row is the only elastic track. This is deliberate and load-bearing:

- The body never scrolls — `html, body, #root { overflow: hidden }`
  (`styles.css:223`). Univer owns all scrolling inside the canvas row.
- Tracks are pinned by **named areas**, not auto-placement. When the formula bar
  or toolbar is hidden (`display:none`), auto-placement used to drop the canvas
  into the wrong track and collapse the grid host to a sliver. Named areas
  (`grid-template-areas`, `styles.css:329`) make each strip's slot independent of
  which siblings render.
- A second template variant, `.app--no-formula-bar` (`styles.css:343`), drops the
  formula-bar track entirely (View → Formula bar off) without disturbing the rest.

```
grid-template-rows:
  var(--titlebar-h)          64px   title bar (two-row)
  var(--toolbar-h)           66px   ribbon
  auto                       0/auto banner (restore / preview; collapses to 0)
  var(--formula-bar-h)       26px   formula bar
  minmax(0, 1fr)             ▮▮▮▮   grid / canvas   ← only elastic track
  var(--mobile-bar-h, 0px)   0px    mobile action bar (0 on desktop)
  var(--sheet-tabs-h)        28px   sheet tabs
```

> **Do** add new chrome by declaring a fixed-height token + a named area and a
> grid-row entry. **Don't** absolutely-position a strip over the canvas or wrap
> the shell in nested flex columns — you lose the "only the canvas stretches"
> guarantee and reintroduce the sliver-collapse bug.

The status bar (`--statusbar-h: 24px`) is the one strip *not* in the `.app` grid
template above — it renders inside the canvas region's own footer layout. Treat
its token as part of the same chrome budget when reasoning about vertical space.

---

## 2. The full shell, top to bottom

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣  Quarterly Model.xlsx                              [Share]  ◐  ⠿  (A)(B)+2 │  titlebar 64
│    File  Edit  View  Insert  Format  Data  Tools  Help                      │  (two rows)
├───────────────────────────────────────────────────────────────────────────┤
│ ⎌ ⎌ │ 🅑 𝑰 U̲ ▾ │ Calibri ▾  11 ▾ │ A▾ ▦▾ │ ≡▾  ⤢ │ %  ,  .00 │ Σ▾  ⧉  ⧉   │  toolbar 66
│     │            │                │      │       │           │            │  (2 button rows)
├───────────────────────────────────────────────────────────────────────────┤
│ [ B7      ⌄] │ ✓ ✕ ⨍ │  =SUM(B2:B6)                                          │  formula bar 26
├───────────────────────────────────────────────────────────────────────────┤
│    │  A    │  B      │  C      │  D      │  E      │  F      │  G      │      │
│  1 │ Item  │ Q1      │ Q2      │ Q3      │ Q4      │ Total   │         │      │
│  2 │ ...   │         │         │         │         │         │         │      │  grid  1fr
│  3 │       │         │         │         │         │         │         │      │ (elastic)
│  ⋮ │       │         │         │         │         │         │         │      │
│    │       │         │         │         │         │         │         │      │
├───────────────────────────────────────────────────────────────────────────┤
│ ◂ ▸ │ ＋ │ Summary │ Q1 │ Q2 │ Q3 │ Q4 │ Data ▾                            │  sheet tabs 28
├───────────────────────────────────────────────────────────────────────────┤
│ Ready          Sum 1,240   Avg 248   Count 5            100% ⊟ ─●─ ⊞       │  status 24
└───────────────────────────────────────────────────────────────────────────┘
```

Components, in order (`apps/web/src/shell/`):

| Strip        | Token             | Px | Component                          |
| ------------ | ----------------- | -- | ---------------------------------- |
| Title bar    | `--titlebar-h`    | 64 | `TitleBar.tsx` (+ `MenuBar.tsx` inline) |
| Ribbon       | `--toolbar-h`     | 66 | `Toolbar.tsx` / `RibbonControls.tsx` |
| Banner       | `auto`            | 0  | `PreviewBanner.tsx`, autosave restore |
| Formula bar  | `--formula-bar-h` | 26 | `FormulaBar.tsx`                   |
| Grid         | `minmax(0,1fr)`   | —  | Univer canvas host                 |
| Mobile bar   | `--mobile-bar-h`  | 0  | `MobileActionBar.tsx` (phone only) |
| Sheet tabs   | `--sheet-tabs-h`  | 28 | `SheetTabs.tsx`                    |
| Status bar   | `--statusbar-h`   | 24 | selection stats footer            |

---

## 3. Proportions and the chrome budget

Desktop chrome sums to **~208px** of fixed vertical space before the canvas
(64 + 66 + 26 + 28 + 24). That is the budget. The rule:

> **Content first.** The canvas is the product; chrome is overhead. Every pixel
> spent on a strip is a pixel taken from the user's data. Justify each one.

How the budget is spent, and why:

- **Title bar (64px) is the most generous strip — on purpose.** It is the only
  two-row element (`TitleBar.tsx:18`): row 1 is the editable filename + identity
  + right actions (Share, theme, presence avatars); row 2 is the classic
  `File / Edit / View …` menu (`MenuBar.tsx` rendered inline, not as a grid
  sibling). Folding the old separate menu-bar strip into the title bar killed the
  "two competing nav strips" feel and *saved* a row overall. The logo spans both
  rows on the left; actions span both on the right; the center column stacks
  filename over menus.
- **Ribbon (66px) is single visual row of two 28px button rows** + 2px gap +
  padding (`styles.css:95`). It is the densest strip: two stacked rows of icon
  buttons grouped by ribbon section (Clipboard, Font, Alignment, Number,
  Editing). Big "lead" buttons (e.g. Paste, AutoSum) span both rows; small
  buttons stack two-high. This is Excel's ribbon at compressed density, not a
  tall Office ribbon.
- **Formula bar (26px) is the thinnest interactive strip.** Name box + ✓/✕/⨍
  actions + the formula input. It earns its small height by carrying mono type
  (`FormulaBar.tsx`) and nothing decorative.
- **Sheet tabs (28px) and status bar (24px) are the floor** — the smallest
  strips, sized to one line of `--text-sm` / `--text-xs` text plus a hairline.

> **Don't** grow any strip past its token to fit a new control. If a strip is
> crowded, overflow into a `▾` menu (the toolbar already does this with edge
> chevrons + a fade mask, `styles.css:5635`). Growing the strip steals canvas.

---

## 4. The alignment grid: 4px base, three radii, hairlines over shadows

Everything snaps to the **4px spacing grid** (`spacing.css:13`). Use the
`--space-*` scale, never raw pixels:

- `--space-2` (4px) — icon-to-label gap, focus inset.
- `--space-3` (6px) — intra-group control gap inside the ribbon.
- `--space-5` (12px) — strip horizontal padding (title bar, formula bar).
- `--space-6` (16px) — separation between major ribbon groups.

Vertical rhythm inside a strip is set by the chrome token, then centered: a 28px
button row inside the 66px ribbon, a single 20px line inside the 24px status bar.
Controls are vertically centered in their track; never top-aligned.

**Radius ladder** (`spacing.css:29`): interactive controls take `--radius-md`
(6px); containers (menus, popovers) `--radius-lg` (10px); dialogs/command
palette `--radius-xl` (14px); the toolbar pill / chips / avatars `--radius-pill`.
**Grid cells never take radius** — the canvas is square by nature.

**Separation is by surface zone + hairline, not shadow** (`colors.css:7`,
`styles.css:14`):

- **Zone 0 white** (`--color-surface`) — content surfaces: title bar, menu bar,
  formula bar, and the grid itself read as one continuous white plane.
- **Zone 1 cool grey** (`--color-surface-strip` / `-alt`) — the tool strips
  (ribbon). The grey-vs-white shift above (white menu) and below (white formula
  bar) is what visually separates the ribbon — *not* a drop shadow.
- Strips are divided by `--color-divider` hairlines (`#edeff3`), never by heavy
  borders. Shadows (`--shadow-*`) are reserved for floating layers (menus,
  dialogs), never for the fixed chrome.

> **Do** lean on the zone shift to separate a strip from its neighbours.
> **Don't** add a `box-shadow` under a chrome strip — it breaks the flat,
> Linear/Notion-style layering the token system is built around.

---

## 5. Content-first: chrome stays out of the way

The shell is a frame; the data is the picture. Concretely:

1. **The canvas is the only track that grows.** Resize the window, toggle a
   panel, hide the formula bar — chrome stays fixed, canvas absorbs the delta
   (`minmax(0, 1fr)`).
2. **Side panels overlay the canvas region, they don't add a shell column.**
   Charts, History, Outline, Tables, Version History (`ChartsPanel.tsx`,
   `HistoryPanel.tsx`, `OutlinePanel.tsx`, `TablesPanel.tsx`,
   `VersionHistoryPanel.tsx`) dock inside the grid row via `PanelRail.tsx` /
   `PanelMutex.tsx` (only one panel open at a time). They never push a new
   top-level grid track.
3. **Transient state uses pills, not new strips.** Save status
   (`SaveStatusPill.tsx`), collab activity (`ActivityPill.tsx`), busy
   (`BusyPill.tsx`), and presence (`AvatarStack`) ride inside the title bar's
   right actions. The banner row exists but is `auto`-height and collapses to 0
   unless a restore/preview banner is actively shown (`styles.css:324`).
4. **Quiet by default.** Chrome uses `--text-base` (13px) and below, medium
   weight at most. No strip competes with cell content for attention. Color is
   spent on the teal accent (`--color-accent #0e7490`) for selection, focus, and
   the primary action only — chrome is neutral slate.

---

## 6. Responsive behavior and the ~360px floor

The shell degrades in two breakpoints (`styles.css:5566`, `styles.css:5831`),
matching the CLAUDE.md mandate: **viewer + light editor down to ~360px (iPhone
SE+)**. Full authoring is desktop; phones get open / scroll / single-cell edit /
basic format / sheet switch.

### `@media (max-width: 720px)` — tablet / large phone

Reclaims roughly one grid row by tightening chrome from ~184 → ~160px
(`styles.css:5568`):

- Tokens shrink: `--titlebar-h: 56`, `--formula-bar-h: 32`, `--sheet-tabs-h: 36`.
  (Formula bar and tabs *grow* slightly for touch targets; the title bar shrinks
  because its right-actions strip is hidden.)
- Title bar `__actions` (Share, kebab) **hidden** — everything it held also lives
  in the File menu (`styles.css:5609`).
- Menu bar and ribbon become **single-row horizontal scrollers** with a
  right-edge fade mask as the scroll affordance (`styles.css:5613`,
  `styles.css:5635`); the ribbon's outer frame stays non-scrolling so the
  overflow chevrons stay pinned to the viewport edge.

### `@media (max-width: 480px)` — phone floor (~360px target)

The light-editor mode:

- Tokens: `--titlebar-h: 48`, `--toolbar-h: 40`, `--sheet-tabs-h: 32`,
  `--mobile-bar-h: 40` (`styles.css:5840`).
- **Ribbon collapses to a single icon-only scrollable strip** — row 2 of every
  group is hidden (`[data-row='2'] { display:none }`), big-button labels +
  chevrons drop, hit targets stay ≥36px. Light formatting (B/I/U, currency /
  percent / comma, font picker) stays one tap away.
- **The mobile action bar appears** (`MobileActionBar.tsx`, `--mobile-bar-h: 40`)
  — a sticky bottom strip above the sheet tabs for thumb-reachable actions,
  horizontally scrollable, scrollbar hidden.
- Title bar drops the brand label (icon only) and the divider; the two center
  rows tighten to ~20–22px each.
- Toasts lift above the bottom action bar + safe-area inset
  (`styles.css:4669`).

> **iOS rule (CLAUDE.md):** any input inside the chrome must be ≥16px font-size
> or Safari focus-zooms. Honour it on the formula input, name box, and rename
> field even though chrome elsewhere runs 11–13px.
>
> **Don't** try to wrap or intercept canvas touch gestures — Univer owns its own
> pan/zoom/select on the canvas. The shell's job on mobile is only the strips.

---

## 7. Where doc and slides differ

The grammar (one grid, fixed chrome strips, one elastic content track,
content-first, 4px alignment, zone-shift separation) is **suite-wide**. The
middle changes:

- **Doc** — Google-Docs bar (not Excel). Same title bar + a *contextual* toolbar,
  **no formula bar, no sheet tabs**. The elastic track is a paginated page
  surface, not a canvas grid; rulers may occupy a thin sub-strip. Status bar
  carries word count / page rather than Sum/Avg/Count.
- **Slides** — title bar + toolbar, then the elastic track splits into a slide
  filmstrip rail (left) + the active-slide canvas; the bottom strip is a
  slide-navigator/notes toggle rather than sheet tabs.

In all three, **reuse the same chrome-height tokens** for any strip that maps
1:1 (title bar, toolbar, status bar). Introduce a new `--*-h` token only for a
genuinely new strip, and add it to `spacing.css` alongside the existing ladder so
the whole suite shares one chrome budget.

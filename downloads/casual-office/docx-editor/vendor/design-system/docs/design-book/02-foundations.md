# 02 · Foundations (look)

The visual language of the Casual Office suite. This chapter defines the raw
material — color, type, spacing, shape, elevation, iconography — that every
surface in sheet / doc / slides / drive is built from. It is **not** a new
system: it documents the principles behind the tokens that already ship in
`/Users/sachin/Desktop/melp/services/design-system/src/tokens/*`, lifted
verbatim from the product shell at
`/Users/sachin/Desktop/melp/services/sheet/apps/web/src/styles.css`.

The contract for the whole suite is simple:

> **Every surface consumes named tokens. No raw hex, no magic px, ever.**
> Tokens are the only API. When a value needs to change for a theme or a
> sibling product, it changes in one place and the whole shell follows.

The worked example throughout is the **sheet** editor (Excel/Office UX bar);
doc/slides differences are called out where they exist.

---

## 1. Color

Source of truth: `src/tokens/colors.css`. Two themes ship — default light on
`:root`, near-black dark under `[data-theme='dark']` — and **both expose the
same token names**. A surface never branches on theme in its own CSS; it reads
the token and the theme has already resolved it.

### 1.1 Principles

- **Hairlines, not shadows, do the separating.** Borders stay whisper-light
  (`--color-border: #e6e9ee`) and the three surface zones carry contrast.
  This is the Linear / Notion discipline: a dense grid product reads cleaner
  with quiet lines and layered surfaces than with floating drop shadows.
- **Surfaces layer in zones, not arbitrary greys.** There are exactly three
  base zones plus a raised plane. Pick by role, never by eyeballing a shade.
- **Interaction states are translucent overlays.** Hover/pressed/selection are
  `rgba()` so they compose correctly on *any* zone — a hovered menu row and a
  hovered toolbar button use the same token over different backgrounds.
- **Accent is identity and is used sparingly.** Teal carries focus, selection,
  and the single primary action on a surface. It is not decoration.

### 1.2 Accent — deep teal-cyan

The Casual Sheets identity colour is `--color-accent: #0e7490` (teal-cyan 700):
the document logo fill, every focus ring, the cell/range selection, and the one
primary action per surface.

| Token | Light | Role |
|---|---|---|
| `--color-accent` | `#0e7490` | brand; primary fill, focus, selection |
| `--color-accent-hover` | `#0c627a` | primary button hover |
| `--color-accent-active` | `#0a5266` | primary button pressed |
| `--color-accent-fg` | `#ffffff` | text/icon ON accent |
| `--color-accent-soft` | `#e6f3f7` | tinted fill behind accent text; focus halo |
| `--color-accent-bright` | `#1597ba` | gradient stop, highlight |
| `--accent-gradient` | `135deg #1597ba→#0e7490` | **CTA + hero marks only** |

In dark theme accent brightens to cyan-400 (`--color-accent: #22d3ee`) so it
glows on near-black without buzzing, and `--color-accent-fg` flips to a dark ink
(`#07181c`) for legible text on the bright fill.

Do:
- use `--color-accent` for the focus ring, the selected range, the active sheet
  tab indicator, and the single primary button.
- pair accent fills with `--color-accent-fg` for foreground — never assume white.

Don't:
- paint large areas accent. Reserve the gradient for the primary CTA and hero
  logo marks; a gradient toolbar is wrong.
- hardcode `#0e7490`. The doc editor overrides accent to cyan (§1.6) — hardcoding
  breaks the sibling-product theming.

### 1.3 Neutrals — the three-zone surface scale

```
zone 0  --color-surface         #ffffff   the canvas / grid
zone 1  --color-surface-alt     #f4f6f9   raised panels, wells, inputs
zone 2  --color-surface-strip   #eef1f5   chrome strips (toolbar, status bar)
raised  --color-surface-raised  #ffffff   menus, popovers, dialogs (float w/ shadow)
        --color-bg              #ffffff   page background
```

Borders:

| Token | Light | Use |
|---|---|---|
| `--color-border` | `#e6e9ee` | whisper hairline — controls, gridlines |
| `--color-border-strong` | `#cdd3db` | input outlines, visible dividers |
| `--color-divider` | `#edeff3` | chrome strip separators |

Glass + scrim float frosted chrome and modal backdrops:
`--color-glass`, `--color-glass-strong`, `--color-glass-border`,
`--color-scrim` (`rgba(15,23,42,0.38)` light → `rgba(5,8,12,0.58)` dark).

Picking a zone:
- **grid / document body** → `--color-surface`.
- **a chrome strip** (toolbar, formula bar, status bar, sheet tabs) →
  `--color-surface-strip`, separated by `--color-divider`.
- **a well or input sitting inside a strip** → `--color-surface-alt`.
- **anything that floats** (menu, popover, dialog) → `--color-surface-raised`
  + a `--shadow-*` (§5). This is the *only* place shadow earns its keep.

Dark theme climbs a tight cool charcoal ramp — `#14161a → #1b1e23 → #23262c →
#2a2e35` — premium near-black, never flat grey.

### 1.4 Text — four-step legibility ramp

| Token | Light | Use |
|---|---|---|
| `--color-text` | `#201f1e` | near-black (faint warm) — primary copy, cell values |
| `--color-text-secondary` | `#605e5c` | body labels, menu text |
| `--color-text-muted` | `#8a8886` | quiet metadata, timestamps |
| `--color-text-disabled` | `#8a8886` | dimmed controls (≥3.55:1) |
| `--color-text-on-accent` | `#ffffff` | text on an accent fill |

Use the ramp by role, top-down. Don't reach below `secondary` for anything a
user must read to act; `muted`/`disabled` are for ambient information only.

### 1.5 Interaction + semantic

Interaction overlays (compose on any zone):

| Token | Light | Use |
|---|---|---|
| `--color-hover` | `rgba(15,23,42,0.045)` | row/button hover |
| `--color-pressed` | `rgba(15,23,42,0.09)` | active press |
| `--color-focus-ring` | `#0e7490` | keyboard focus (= accent) |
| `--color-selected` | `rgba(14,116,144,0.11)` | selected range / row fill |
| `--color-selected-strong` | `rgba(14,116,144,0.20)` | active selection edge |
| `--color-toolbar-pill` | `#eef1f5` | neutral well behind active formula range |

Semantic — the spreadsheet status language, sourced from the home template
badge palette so cell badges, validation, and banners share one set. Each pairs
a saturated foreground with a soft fill:

| Meaning | fg | soft fill | Use |
|---|---|---|---|
| success | `--color-success #15803d` | `--color-success-soft #dcfce7` | "On Track", "Done" |
| warning | `--color-warning #b45309` | `--color-warning-soft #fef3c7` | "At Risk", "In Progress" |
| danger | `--color-danger #b91c1c` | `--color-danger-soft #fee2e2` | errors, over-budget, `#REF!` |
| info | `--color-info #1d4ed8` | `--color-info-soft #dbeafe` | links, info banners |

Rule: **fg on soft, never fg on white for a badge** — the soft fill is what
makes a status read as a chip rather than colored text. In dark theme the soft
fills become low-alpha tints of the fg so they glow rather than block.

### 1.6 Suite accents — sibling products

When (and only when) a surface references the whole suite — umbrella nav,
cross-product links — use the sibling accents:

```
--suite-sheets   #0e7490   this product (teal)
--suite-editor   #0891b2   Casual Editor (.docx) — cyan
--suite-slides   #b91c1c   Casual Slides (.pptx) — red
--suite-desktop  #ea580c   Casual Desktop — orange
```

> **Canonical product naming (single source of truth for this book).** The suite
> is **Casual Sheets**, **Casual Editor** (the `.docx` editor — referred to as
> `docs` only in the `data-app='docs'` attribute and the `--suite-editor` token,
> never as "Doc" in prose), **Casual Slides**, **Casual Desktop** (the Tauri
> shell), and **Casual Drive** (the file/identity layer — it ships a product mark
> but no `--suite-*` accent token yet, since it has no editor canvas to re-tint).
> Use these names everywhere; where older sections say "Doc," read "Casual Editor."

Inside a given editor, **always lead with `--color-accent`**, never a sibling
token. The doc editor doesn't hardcode cyan; it overrides `--color-accent` and
its derivatives via `src/tokens/editor-theme.css` (imported after `tokens.css`,
scoped to `[data-app='docs']`) so every accent-bound surface re-tints with zero
per-component branching. Slides will follow the same override pattern.

---

## 2. Typography

Source: `src/tokens/typography.css` + `src/tokens/fonts.css`. Three families,
one icon font. Loaded from Google Fonts (the exact URLs the upstream app uses).

### 2.1 The three families

| Token | Family | Job |
|---|---|---|
| `--font-sans` | **Inter** | every piece of UI text — the workhorse |
| `--font-mono` | **JetBrains Mono** | anything tabular/code-like: Name Box, formula bar, cell addresses, kbd chips, version tags |
| `--font-display` | **Manrope** | large display headlines on home / hero takeover surfaces only |

Stacks fall back to Segoe UI / system sans, so the shell degrades gracefully
before webfonts land.

**Mono is not optional polish — it is correct.** The Name Box, formula input,
A1 addresses, and keyboard chips are monospaced because column alignment and
character disambiguation (`l` vs `1`, `O` vs `0`) matter in a spreadsheet. Use
`--font-mono` for any cell-coordinate or formula context; use `--font-sans`
everywhere else.

Never use Manrope for body or controls — it is a headline face and reads heavy
at small sizes. Below `--display-sm`, use Inter.

### 2.2 Type scale

This is a **dense spreadsheet shell, not a marketing page** — the scale is
deliberately small. Base body is 13px; the smallest label is 11px.

| Token | px | Use |
|---|---|---|
| `--text-xs` | 11 | eyebrows, status-bar stats, badges |
| `--text-sm` | 12 | secondary labels, sheet tabs |
| `--text-base` | 13 | **body** — menus, cells, toolbar |
| `--text-md` | 14 | dialog body, primary buttons |
| `--text-lg` | 16 | dialog titles, section heads |

Display scale (Manrope, hero/home only): `--display-sm 28` · `--display-md 36`
· `--display-lg 44`.

Line height: `--leading-tight 1.2` (display, single-line chrome) ·
`--leading-normal 1.4` (UI default) · `--leading-relaxed 1.6` (long-form doc
body copy — the doc editor's reading column leans on this).

Weight: `--weight-regular 400` · `--weight-medium 500` (default UI emphasis) ·
`--weight-semibold 600` (labels, active states) · `--weight-bold 700` (display).

Tracking: `--tracking-tight -0.022em` on display sizes only; `--tracking-wide
0.04em` for uppercase eyebrows; `--tracking-normal 0` everywhere else.

Inter ships with stylistic-set tuning enabled in the shell
(`font-feature-settings: 'cv11','ss01','ss03'` — see `styles.css:236`) for a
cleaner single-storey `a` and disambiguated forms at small sizes. Keep this on
the root; don't override it per-component.

### 2.3 Tabular numerals — non-negotiable in the grid

Any surface that shows **numbers that change or align in columns** must use
`font-variant-numeric: tabular-nums`. The shell applies it in ~20 places
(`styles.css` selection-stats, sum/avg/count readouts, the formula bar, value
chips). Without it, digits jitter as values update and columns of figures fail
to align — an immediate Excel-parity failure.

Do: set `tabular-nums` on cell value readouts, the status-bar SUM/AVG/COUNT,
version numbers, and any numeric badge.
Don't: rely on JetBrains Mono *alone* to fix alignment in an Inter context —
apply `tabular-nums` explicitly; the two are independent properties.

---

## 3. Spacing

Source: `src/tokens/spacing.css`. A **strict 4px base grid** keeps dense chrome
aligned. The smaller `--space-1 (2px)` and `--space-3 (6px)` are the half-steps
the tight chrome needs; everything else is a 4px multiple.

```
--space-0   0      --space-5   12px
--space-1   2px    --space-6   16px
--space-2   4px    --space-7   20px
--space-3   6px    --space-8   24px
--space-4   8px    --space-9   32px
                   --space-10  48px
```

Principles:
- **Every margin, padding, and gap is a `--space-*` token.** No raw px.
- Chrome controls live in the 4–8px band (`--space-2`..`--space-4`); panels and
  dialog interiors in the 12–24px band (`--space-5`..`--space-8`); section
  rhythm and hero whitespace at `--space-9`/`--space-10`.
- Prefer `gap` on flex/grid over per-child margins so the grid stays honest.

### 3.1 Chrome layout heights

The app shell is a strict vertical grid where **only the grid row stretches**.
The fixed strips are tokens — reuse them to rebuild the shell, don't re-measure:

```
┌──────────────────────────────┐
│ title bar     --titlebar-h     64px  (two-row: filename + menus)
├──────────────────────────────┤
│ toolbar       --toolbar-h      66px  (ribbon, two button rows)
├──────────────────────────────┤
│ formula bar   --formula-bar-h  26px  (Name Box + formula input)
├──────────────────────────────┤
│ grid          (flex: 1)              ← the only stretching row
├──────────────────────────────┤
│ sheet tabs    --sheet-tabs-h   28px
├──────────────────────────────┤
│ status bar    --statusbar-h    24px  (selection stats)
└──────────────────────────────┘
```

Doc/slides keep the title bar and status bar but drop the formula bar and sheet
tabs; the toolbar height stays consistent across the suite so the chrome reads
as one product family.

---

## 4. Shape / radius

Source: `src/tokens/spacing.css`. A tight, consistent radius ladder — two radii
do almost all the work.

| Token | px | Use |
|---|---|---|
| `--radius-sm` | 4 | tiny chips, focus inset |
| `--radius-md` | 6 | **all interactive controls** — buttons, inputs, menu rows |
| `--radius-lg` | 10 | cards, menus, popovers |
| `--radius-xl` | 14 | dialogs, command palette, large panels |
| `--radius-pill` | 999 | toolbar pill, chips, avatars |

Rules:
- A control gets `--radius-md`; the container it floats in gets `--radius-lg`
  or `--radius-xl`. Bigger surface → bigger radius, so nesting reads correctly.
- **Grid cells never take radius.** The canvas is square by definition; rounding
  cells would break the Excel feel and the canvas renderer.
- Pills (`--radius-pill`) are for genuinely pill-shaped objects — the formula
  range pill, status chips, avatars — not as a generic "rounder button."

---

## 5. Elevation / shadow

Source: `src/tokens/spacing.css`. Remember the core principle: **borders and
surface zones carry most separation; shadow is reserved for things that
genuinely float.** A static panel inside the shell gets a hairline and a zone,
not a shadow.

| Token | Use |
|---|---|
| `--shadow-1` | barely-raised: hover lift on a card |
| `--shadow-2` | popovers, dropdown menus, the toolbar overflow |
| `--shadow-3` | dialogs, command palette |
| `--shadow-4` | full-screen modals, the heaviest takeover surfaces |
| `--glow-accent` | `0 0 0 3px var(--color-accent-soft)` — focus halo / active CTA |

Each shadow is a layered slate-tinted pair (a tight contact shadow + a soft
ambient one) so floats feel placed, not dropped. In dark theme the shadows
deepen substantially (opacities to 0.44–0.70) because a faint shadow vanishes on
near-black — the override lives in the same file under `[data-theme='dark']`.

Do: pair every floating surface with `--color-surface-raised` + the matching
`--shadow-*`. Use `--glow-accent` for focus rings on inputs and the active
primary button.
Don't: stack shadows on in-flow chrome strips, or invent a custom `box-shadow` —
if a new elevation is needed, add a token.

---

## 6. Iconography — Material Symbols Outlined

Source: `src/tokens/fonts.css` + the `.material-symbols-outlined` / `.icon--*`
rules in `styles.css:262–305`. The **entire** icon set is Material Symbols
Outlined, loaded as the variable font with all four axes
(`opsz,wght,FILL,GRAD`). Icons are rendered as ligatures: a `<span class="material-symbols-outlined">` whose text content is the icon name
(`format_bold`, `pivot_table_chart`, `functions`).

### 6.1 Hard rules

- **Never use a text glyph or emoji as an icon, and never a second icon
  library** (no Fluent, no Lucide, no inline SVG sets). One font, ligature names
  only. This keeps weight/size/fill consistent and theming free.
- **Default axes: `FILL 0, wght 400, GRAD 0, opsz 24`** (unfilled outline).
  This is the resting state for the whole suite.
- Color icons with `color` via a text token (`currentColor` from
  `--color-text-secondary` for resting chrome icons, `--color-accent` for active).
  Icons inherit text color — don't fill them with a background.

### 6.2 Sizing

Set size with the helper classes; they pair `font-size` with the matching
optical-size axis so the icon stays crisp at that size:

| Class | font-size | opsz | Use |
|---|---|---|---|
| `.icon--sm` | 16px | 20 | inline-with-text, dense menu rows |
| (base) | 20px | 24 | default chrome / toolbar icons |
| `.icon--lg` | 24px | 28 | section heads, empty-state marks |

Match `opsz` to the rendered size — that is what optical sizing is for. Don't
scale a 24-opsz icon down with `transform`.

### 6.3 Fill rule

Fill encodes selected/active state, matching Google's own convention:

- **Resting / inactive** → `FILL 0` (outline). The vast majority of icons.
- **Selected / active / toggled-on** → `.icon--filled` (`FILL 1, wght 500`):
  the pressed toolbar button, the current sheet's tab icon, an enabled toggle.

So a bold button shows an outline `format_bold` normally and the filled, slightly
heavier variant when the selection is bold. Flip the axis, don't swap to a
different icon — the variable font animates the transition smoothly with the
`--motion-fast` token.

---

## 7. Applying foundations — the short version

1. **Read tokens, never literals.** Every color, size, radius, shadow, and font
   comes from a `--*` token. A literal hex/px in a component is a bug.
2. **Same names, both themes.** Don't branch on `[data-theme]` in component CSS;
   the theme already resolved the token.
3. **Separate with zones + hairlines; float with shadow.** Shadow is for menus,
   popovers, and dialogs — not in-flow chrome.
4. **Accent is identity, used once per surface.** One primary action, the focus
   ring, the selection. The gradient is for the CTA and hero marks only.
5. **Mono + tabular-nums anywhere numbers align or formulas live.**
6. **Icons are Material Symbols Outlined ligatures.** `FILL 0` resting,
   `FILL 1` active. Never a glyph, never a second set.

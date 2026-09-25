# 07 · Components & patterns

The library you build the chrome from. Every primitive here is real code in
`/Users/sachin/Desktop/melp/services/design-system/src/components/*`, every value
is a real token from `/Users/sachin/Desktop/melp/services/design-system/src/tokens/*`.
This chapter is the **skill set**: when to reach for each component, what
states it carries, and the one do/don't that keeps the editor feeling like a
serious tool (Excel for sheet; Google Docs for doc) instead of a widget demo.

Two rules apply to everything below:

- **Don't restyle a primitive inline to fake a new variant.** If you find
  yourself passing `style={{ background: ... }}` to change a Button's role,
  you want a different variant or a different component. Inline `style` is for
  layout (width, margin, grid placement), not for re-skinning.
- **Tokens, never literals.** Spacing comes off the 4px grid (`--space-*`),
  radius off the two-step ladder (`--radius-md` controls, `--radius-lg`
  containers), color off the semantic ramp. A raw hex or a `7px` in a feature
  PR is a review blocker.

---

## Buttons

### Button — `buttons/Button.tsx`

The text action. Variants: `primary` (teal `--accent-gradient`, white fg —
the one committing action on a surface), `secondary` (white surface +
`--color-border-strong`, the default), `subtle` (transparent, for low-stakes
inline actions and menu-adjacent triggers), `danger` (solid `--color-danger`,
destructive confirm only). Sizes `sm` (28px) / `md` (34px) / `lg` (42px),
matching the chrome-height grid. Carries hover (lift `-1px` + brighten/well),
active (press `+1px`), focus (`--glow-accent` ring), disabled (0.5 opacity,
`not-allowed`). Optional leading `icon` / trailing `iconRight` (Material
Symbols ligature names).

- **States are automatic.** Don't hand-roll hover/focus on a `<button>` —
  that's the whole point of the primitive. The focus ring is a token
  (`--glow-accent`); never strip it with `outline: none`.
- **One primary per surface.** A dialog footer has exactly one `primary`
  (the commit); everything else is `secondary` or `subtle`.

> **Do** — confirm dialog footer:
> `<Button variant="subtle">Cancel</Button>` + `<Button variant="primary">Save changes</Button>`.
> **Don't** — two `primary` buttons side by side, or a `primary` used for
> "Cancel" because it's visually bigger. Primary = the thing that commits.

> **Don't** use `danger` for routine saves or "Apply." It's reserved for
> delete / discard / clear-all — actions a user can't trivially undo. Pair it
> with a confirm dialog (see Patterns).

### IconButton — `buttons/IconButton.tsx`

The square, label-only action — the backbone of the toolbar and formula bar.
Sizes `sm` (24px) / `md` (28px) / `lg` (36px). Carries hover (`--color-hover`
well), focus ring, and crucially **`pressed`**: when a formatting toggle is on
(bold, italic, wrap, a sticky panel), `pressed` paints `--color-selected` fill
+ `--color-accent` glyph and sets `aria-pressed`. `label` is **required** and
becomes both `aria-label` and `title`.

- **Always pass a real `label`.** "Bold", "Merge cells", "Insert chart" — not
  "button" or "". This is the only accessible name a screen reader gets, and
  it's the native tooltip.
- **Use `pressed` for state, not color.** Don't tint the glyph yourself to
  show "active"; set `pressed` and let the toggled treatment + `aria-pressed`
  come for free.

> **Do** — toolbar bold toggle: `<IconButton icon="format_bold" label="Bold" pressed={isBold} onClick={toggleBold} />`.
> **Don't** — use IconButton for a destructive or committing action with no
> text. "Delete sheet" as a bare trash glyph with no confirm is how users lose
> work. Either give it a Tooltip + confirm, or make it a labeled menu item.

> Hit target note: `sm` IconButton is 24×24 — below the 44px touch minimum.
> Fine for dense desktop toolbars (Excel's are ~22px); on the mobile action
> bar (`apps/web/src/shell/MobileActionBar.tsx`) use `lg` and pad the row.

---

## Forms

All form controls share the focus language: `--color-accent` border + a
`0 0 0 3px --color-accent-soft` halo. Invalid swaps to `--color-danger` /
`--color-danger-soft`. Don't invent a different focus treatment per control.

### Input — `forms/Input.tsx`

Single-line text/number entry. Sizes `sm` (28px) / `md` (34px). Optional
`label`, `hint`, leading `icon`, `invalid`, `full`. When `label`/`hint` are
present it renders a `<label>` wrapper so the field is click-associated.

- **Validation lives in `invalid` + `hint`.** Set `invalid` and put the
  message in `hint` (it turns danger-colored automatically). Don't render a
  separate red `<div>` of error text — the component already has the slot.
- **iOS:** any Input inside the editor chrome must keep the rendered font
  ≥16px to avoid focus-zoom. The `md` size (`--text-md` = 14px) is below that
  — bump to 16px on the `@media (max-width: 480px)` breakpoint per
  `apps/web/src/styles.css`.

> **Do** — a panel field: `<Input label="Name" hint="Must be unique" invalid={taken} value={v} onChange={...} full />`.
> **Don't** — use Input for the formula bar or Name Box. Those are bespoke
> mono-font controls (`FormulaBar.tsx`) — they read like cell references
> (`--font-mono`), not like form fields.

### Select — `forms/Select.tsx`

Native `<select>` styled to match, with a custom `arrow_drop_down` chevron.
Use for **short, fixed** option sets where native is fine: font family, font
size, number format, border style. Sizes `sm` (26px) / `md` (32px). Accepts
`options` as strings or `{value,label}`, or `children`.

- **Native on purpose.** It inherits OS keyboard/scroll/mobile-wheel behavior
  for free and stays accessible. Don't replace it with a `Menu` for a plain
  picker.
- **Use a `Menu` (not Select) when** items need icons, sections, shortcuts,
  danger styling, or checkmarks — Select can't render those.

> **Do** — font-size picker in the ribbon: `<Select size="sm" options={['8','9','10','11','12','14']} />`.
> **Don't** — stuff 200 fonts with previews into a Select. That's a searchable
> Menu/combobox, a separate pattern.

### Checkbox — `forms/Checkbox.tsx`

Boolean, with `indeterminate` (renders the `remove` glyph — use it for
parent rows whose children are mixed). 16px box, `--color-accent` when on.
Optional `label` + `hint`.

- **Checkbox = independent options that persist on submit** (panel settings,
  "Apply to all sheets"). For an instant on/off **state** that takes effect
  immediately, use **Switch**.

> **Do** — Format Cells dialog: `<Checkbox label="Wrap text" checked={wrap} />`.
> **Don't** — use a Checkbox where the change is immediate and consequential
> (e.g. "Show formulas" toggling the whole grid). That's a Switch — the toggle
> motion signals "this happens now."

### Switch — `forms/Switch.tsx`

Instant binary state, 32×18 track + sliding knob, `role="switch"`. Theme
toggle, "Show gridlines", "Snap to grid", autosave on/off.

- **Switch implies immediate effect, no Apply step.** If a Save button has to
  confirm it, it should have been a Checkbox.
- It has **no built-in focus ring** in the source today. When you place a
  Switch in a keyboard-navigable settings panel, wrap it so the focus halo is
  visible — don't ship a keyboard-invisible toggle.

> **Do** — settings row: label on the left, `<Switch checked={dark} onChange={...} />` right-aligned.
> **Don't** — a column of five Switches that only take effect when you hit
> "Save." Those are Checkboxes.

---

## Display

### Badge — `display/Badge.tsx`

Tiny (19px) **status descriptor on content** — cell validation, a row's
"On Track / At Risk", a `#REF!` error tag, a "Beta" marker. Tones map to the
semantic ramp: `neutral / accent / success / warning / danger / info`.
Modifiers: `solid` (filled capsule, white text — for high-emphasis counts),
`dot` (leading status dot), `icon`.

- **Badge labels a thing; it's not a button.** No hover, no click. If it does
  something, you want a Pill or an IconButton.
- Keep it one or two words. Tone carries the meaning — green is good, amber is
  caution, red is error — so the word can be short.

> **Do** — `<Badge tone="danger" icon="error">#REF!</Badge>` beside a broken cell ref.
> **Don't** — use `solid danger` Badges for decoration. Saturated red is an
> alarm; spend it only on real errors.

### Pill — `display/Pill.tsx`

The **chrome status chip**, often interactive. 22px, pill radius, sits on the
toolbar/status strips (`--color-toolbar-pill` well). Tones `neutral / accent /
success / warning`. Two killer props: `mono` (renders in JetBrains Mono — for
cell addresses, version tags, ranges like `A1:D20`) and an optional `onClick`
(switches it from `<span>` to a real `<button>`). This is what SaveStatusPill,
ActivityPill, NamePill, BusyPill are built on.

- **`mono` for anything address/version/range-shaped.** It visually rhymes
  with the formula bar and reads as "data," not "label."
- A clickable Pill is a button — give it a clear affordance and, if it opens a
  panel, reflect open-state with `tone="accent"`.

> **Do** — `<Pill tone="success" icon="cloud_done">Saved</Pill>`; `<Pill mono>A1:D20</Pill>`.
> **Don't** — use a Pill where a Badge belongs (inline on grid content). Pills
> live in chrome strips; Badges live on content. Mixing them muddies the
> "where am I" signal.

### Avatar / AvatarStack — `display/Avatar.tsx`, `display/AvatarStack.tsx`

Presence. Avatar: deterministic color from name hash (so a given collaborator
is always the same color across the suite), initials fallback, optional `src`,
and **`active`** (green `--color-success` ring = live co-editing peer).
AvatarStack overlaps up to `max` (default 4) then collapses to a `+N` chip in
muted gray.

- **`active` ring means "in the room right now."** Don't use it for "has
  access" — that's a static avatar. The green ring is the live-cursor signal.
- Keep the stack short. Default `max={4}`; in tight chrome drop to 3. The
  `+N` is fine — it's Excel/Docs behavior.

> **Do** — title-bar presence: `<AvatarStack people={peers} max={4} />` next to the Share button.
> **Don't** — render 12 raw Avatars in a row in the title bar. Collapse them.

### Card — `display/Card.tsx`

Container for the **home / file-picker grid** (`/home`), not for editor
chrome. `--radius-lg`, hairline border, `--shadow-1` resting. `interactive`
adds a `-2px` lift + `--shadow-2` + border-color shift on hover; `accent`
reveals a colored top strip on hover (the file-type color bar — teal for
sheet, cyan for doc, red for slides per `--suite-*`).

- **Cards are for the launcher, not the workspace.** The editor leans on
  hairline borders and surface-zone contrast (Linear/Notion style), not
  floating cards. Don't wrap a toolbar group or a panel section in a Card.
- Use `accent` with the suite color to telegraph file type at a glance in a
  mixed Drive listing.

> **Do** — file tile: `<Card interactive accent="var(--suite-sheets)">…</Card>`.
> **Don't** — nest Cards inside Cards. One elevation step per surface.

### Kbd — `display/Kbd.tsx`

Keyboard chips. Splits `"Ctrl+Shift+L"` into per-key caps, JetBrains Mono,
2px bottom border for the keycap look. Sizes `sm` / `md`.

- **Render with the platform's modifier glyphs.** Use the `formatShortcut` /
  `shortcut-format` util in the shell so Mac shows `⌘ ⇧` and Windows shows
  `Ctrl Shift` — don't hardcode `Ctrl`.
- Kbd is the standalone chip (shortcuts dialog, tooltips). Inside a **Menu**,
  the shortcut goes in the item's `shortcut` prop (plain mono text,
  right-aligned) — don't nest a Kbd there.

> **Do** — KeyboardShortcutsDialog row: action name left, `<Kbd keys={fmt('Ctrl+Shift+L')} />` right.
> **Don't** — Kbd for a key the action doesn't actually bind. The chip is a
> promise the shortcut works.

---

## Overlays

### Dialog — `overlays/Dialog.tsx`

Modal. `--color-scrim` backdrop with `blur(3px)`, `--radius-xl` panel,
`--shadow-4`, `cs-anim-rise` entrance. Slots: `title` (+ optional accent
`icon`), `children` body, right-aligned `footer` (button row). `aria-modal`,
`role="dialog"`, labeled by title; click-scrim and the × both call `onClose`.
Default width 440px.

- **One modal at a time.** Don't stack dialogs. A dialog that needs a confirm
  spawns the confirm and dismisses itself, or uses inline confirmation.
- **Footer = actions only, right-aligned, primary last.** Don't put body
  controls in the footer or scatter the commit button into the body.
- Close affordances are wired (scrim + ×). Also handle **Esc** and **focus
  trap + restore** at the call site — the primitive gives you the chrome, not
  the focus management. Move initial focus to the first field or the primary
  action.

> **Do** — FormatCellsDialog: title "Format cells", body = Tabs + form,
> footer = `[Cancel(subtle)] [Apply(primary)]`.
> **Don't** — use a Dialog for a transient confirmation that could be a
> Tooltip or an inline message, or for a long settings surface that should be
> a docked panel (`PanelRail`).

### Menu — `overlays/Menu.tsx`

Command list — the File menu, right-click context menu, overflow `⋯`. Entries
are `MenuItem` (`label`, `icon`, `shortcut`, `danger`, `checked`, `disabled`,
`onClick`), `{divider:true}`, or `{header:'…'}`. Items are 30px tall with a
fixed 18px icon gutter (so labels align whether or not they have icons),
mono right-aligned `shortcut`, `--color-hover` on hover, `--color-danger` for
`danger`. `role="menu"` / `role="menuitem"`. Default width 232px.

- **Group with `header` + `divider`; mark destructive with `danger`.** Put
  `shortcut` on every item that has a real binding — discoverability is the
  point.
- The Menu component renders the list; **positioning + open/close + arrow-key
  navigation** belong to the trigger (use the shell `Popover.tsx`). Don't
  position a Menu with raw `style` at the call site.

> **Do** — File menu with a `header:"Export"`, items for xlsx/csv/pdf, a
> `divider`, then `{label:"Delete", icon:"delete", danger:true}`.
> **Don't** — overload one Menu with 30 ungrouped items. Section it, or split
> into submenus.

### Tooltip — `overlays/Tooltip.tsx`

Hover/focus hint, dark (`#201f1e`) chip, optional mono `shortcut`, four
placements, `role="tooltip"`, `cs-anim-fade`. Shows on `mouseenter` **and**
`focus` (keyboard reachable).

- **Augment, never inform.** A tooltip explains an icon-only control; the UI
  must still work if it never appears. Don't hide required info (validation,
  the only label for an action) in a tooltip.
- IconButton already sets `title`/`aria-label`. Add a Tooltip on top **when
  you want the styled chip + a shortcut**; don't double up plain text.

> **Do** — `<Tooltip label="Merge & center" shortcut="⌥⌘M"><IconButton .../></Tooltip>`.
> **Don't** — tooltip-only error messages, or tooltips on touch (no hover —
> the mobile path must surface the same info another way).

### Tabs — `overlays/Tabs.tsx`

In-surface section switcher — dialog sections (Format Cells: Number / Align /
Font / Border / Fill), a panel's view modes. 34px, accent underline on the
active tab, `role="tablist"`/`role="tab"`/`aria-selected`. Controlled
(`value`) or uncontrolled (`defaultValue`).

- **Tabs ≠ the ribbon.** The Excel-style ribbon (Home / Insert / Data) is its
  own chrome construct (`RibbonControls.tsx` / `Toolbar.tsx`), not this Tabs
  primitive. Use Tabs inside dialogs and panels.
- Wire the `tabpanel` side at the call site: each panel needs `role="tabpanel"`
  and `aria-labelledby` pointing at its tab. The primitive renders the strip,
  not the panels.

> **Do** — FormatCellsDialog section switcher.
> **Don't** — use Tabs for primary app navigation between files/sheets. Sheet
> switching is the bottom tab strip (`SheetTabs.tsx`), a different pattern.

### Icon — `Icon.tsx`

Material Symbols Outlined, ligature by `name`. Sizes `xs`(14)…`xl`(24) or a
number; `filled` ramps the FILL axis; `weight` 100–700. `aria-hidden` by
default.

- **Outlined is the house style.** Use `filled` only for a genuinely "on"
  state (a selected nav item), matching how the icon font's FILL axis reads.
- **Material Symbols only** — never an emoji, a text glyph, or a second icon
  set. (See the design-system memory: Material Symbols Outlined is the bar.)
- Decorative icons stay `aria-hidden`; a meaningful standalone icon needs a
  label on its wrapper (which is why IconButton requires `label`).

> **Do** — `<Icon name="format_bold" />`, `<Icon name="cloud_done" filled />` for saved.
> **Don't** — pass a unicode arrow as a label or build a chevron from a `▾`.
> Use `name="arrow_drop_down"`.

---

## Composition patterns

### Toolbar / ribbon groups

The ribbon is rows of **IconButton** + small **Select** + **Pill**, clustered
into groups separated by 1px `--color-divider` dividers, on the
`--color-surface-strip` chrome zone (`--toolbar-h` = 66px, two button rows).

```
┌ Clipboard ─┬ Font ───────────────┬ Alignment ──────┐
│ [paste]    │ [Inter ▾][11 ▾] B I │ ⌐ ¬ ≡  wrap merge│
└────────────┴─────────────────────┴──────────────────┘
   IconBtn       Select  Select  IconButton(pressed)
```

- Group related controls; divider between groups, not between every button.
- Format toggles use IconButton `pressed` bound to the current selection's
  state — the toolbar reflects the active cell, always.
- Overflow collapses into a `⋯` IconButton → Menu (and on mobile, into
  `MobileActionBar`). Don't horizontally scroll a ribbon.

### Forms in panels (PanelRail)

Docked right-side panels (Charts, Tables, Outline, History) hold settings
forms. Layout: a `--text-lg` section title, then rows of
**label + control**, controls right-aligned or full-width, **`--space-5`
(12px)** between rows, grouped under `Tabs` or `header`-style subheads.

- Use `Input`/`Select`/`Checkbox`/`Switch` straight — same focus language as
  dialogs, so the panel and modals feel like one system.
- Panels are **non-modal and live**: changes apply immediately (Switch /
  instant Select), or batch behind an explicit "Apply" at the panel foot for
  expensive recomputes. Pick one model per panel and be consistent.
- Only one panel open at a time (`PanelMutex.tsx`). Don't fan out three
  competing right panels.

### Confirm dialogs

Destructive or lossy actions (delete sheet, discard changes, clear range)
route through a Dialog, not a bare action.

```
┌───────────────────────────────────────┐
│ ⚠  Delete “Q3 Budget”?                 │  title + danger/warning icon
├───────────────────────────────────────┤
│ This sheet and its data will be        │  body: plain consequence
│ removed. This can’t be undone.         │
├───────────────────────────────────────┤
│              [ Cancel ] [ Delete ]     │  subtle + danger, primary-last
└───────────────────────────────────────┘
```

- Title states the **object and the action** ("Delete 'Q3 Budget'?"), body
  states the **consequence and reversibility**. No "Are you sure?" with no
  detail.
- Confirm button is `danger` and **labels the verb** ("Delete", not "OK");
  Cancel is `subtle`. Move initial focus to **Cancel** for destructive
  confirms so a reflexive Enter doesn't nuke data.
- Skip the dialog entirely when the action is cheaply undoable — prefer
  optimistic apply + an undo toast over a confirm prompt. Reserve confirms for
  the truly unrecoverable.

---

## Accessibility basics

These are non-negotiable across the suite.

- **Focus rings ship, always.** The token is `--glow-accent`
  (`0 0 0 3px --color-accent-soft`); Button/IconButton/Input/Select wire it
  on `:focus`. Never `outline: none` without a replacement ring. Switch lacks
  one today — add one when you place it in a keyboard path.
- **Every interactive element is keyboard-reachable and operable.** Menus get
  arrow-key nav + Esc; Dialogs trap focus and restore it on close; Tabs are
  arrow-navigable; Tooltips fire on `focus`, not just hover.
- **Hit targets:** desktop chrome runs dense (24–28px, Excel-tight) and that's
  acceptable for pointer use; **touch surfaces need ≥44px** — use `lg`
  controls and padded rows on `MobileActionBar` and the `≤480px` breakpoint.
- **Contrast:** body text `--color-text` on white clears AA comfortably;
  `--color-text-secondary` (#605e5c) and `--color-text-disabled` (~3.55:1) are
  for non-essential/disabled text only — never put required information at
  disabled contrast. Don't encode meaning in color alone: pair status color
  with an icon or word (the Badge `icon`/`dot`, the Pill icon).
- **Names:** IconButton `label`, Dialog `title`, Avatar `name` (→ `title`),
  and the `aria-pressed`/`aria-selected`/`role` wiring already baked into the
  primitives are the accessible surface. Honor them — pass real labels, don't
  pass `""`.
- **Motion:** entrances use `--motion-*` (90–240ms, the canonical token values —
  see §05). Respect
  `prefers-reduced-motion` at the app level for the larger panel/dialog
  entrances.

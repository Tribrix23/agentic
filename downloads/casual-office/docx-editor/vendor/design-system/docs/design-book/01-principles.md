# 01 — Principles & Product Voice

This is the constitution for the Casual Office suite (Sheet, Doc, Slides, Drive).
Everything downstream — components, layouts, copy, motion — answers to the
principles here. Examples lead with the **Sheet** editor because it is the most
demanding surface (dense grid, formula language, Excel keyboard parity); where
Doc or Slides diverge, it is called out.

This is a *target redesign* spec, but it is **grounded in the design system we
already ship**. Do not invent a new palette, type scale, or motion language.
Every value below traces to a real token:

- Color: `services/design-system/src/tokens/colors.css` — accent `--color-accent: #0e7490` (deep teal-cyan).
- Type: `services/design-system/src/tokens/typography.css` — Inter UI, JetBrains Mono tabular, Manrope display.
- Spacing/shape/elevation/motion/chrome-heights: `services/design-system/src/tokens/spacing.css`.
- Motion keyframes + classes: `services/design-system/src/tokens/motion.css`.
- Icons: Material Symbols Outlined (see `apps/web/src/shell/Icon.tsx`).
- Live editor chrome: `services/sheet/apps/web/src/shell/*` + `apps/web/src/styles.css`.

---

## Who the user is

A **working professional with a spreadsheet open all day** — finance, ops,
analysts, founders, PMs — who already lives in Microsoft Excel and reaches for
keyboard shortcuts before menus. They are fast, opinionated, and impatient with
software that gets in their way. They did not come to learn a new tool; they
came to do the same work they already know how to do, in the browser, with other
people in the file at the same time.

Three things follow from that:

1. **They have muscle memory.** `Ctrl+Shift+L` is filter. `F2` edits a cell. `Ctrl+;` is today's date. Violating these is not "a different choice" — it is a bug.
2. **They judge in the first 10 seconds.** Dense, calm, and recognizably Excel reads as "this is real software." Playful, sparse, or novel reads as "this is a toy I can't trust with the quarterly model."
3. **They are not impressed by chrome.** The grid is the product. Every pixel the UI takes is a pixel of data they can't see.

Secondary user: the **mobile viewer** (down to ~360px) who opens a file to read
it, scroll it, fix one cell, and send it on. Designed for, but never at the
expense of the primary desktop user.

---

## Product voice & personality

**Professional, calm, dense-but-legible, fast.** A serious tool worn lightly.

The name says "casual" — that lives in the *tone of words*, never in the *rigor
of the craft*. Microcopy is plain and human ("Couldn't open this file" not "Error
0x4 — operation failed"). The interface itself is precise, quiet, and exact.

Voice rules:

- **Plain over clever.** "Saved" beats "All set! ✨". State facts; skip celebration.
- **Calm under failure.** Errors explain what happened and what to do next, in one sentence, secondary-text color — never red panic walls. See `apps/web/src/shell/humanize-error.ts` as the existing standard.
- **No emoji, no exclamation marks** in product UI. Energy comes from speed and polish, not punctuation.
- **Confident, not chatty.** Don't narrate ("We're now loading your data…"); show the result.
- **Suite-consistent.** Sheet leads with teal `#0e7490`; Doc shifts accent to cyan `#0891b2` (`tokens/editor-theme.css`); Slides red `--suite-slides: #b91c1c`. Voice and structure stay identical across all four — only the accent changes.

---

## The principles

### 1. Familiarity over novelty

> **Rule:** When Excel (Sheet) or Google Docs (Doc) has solved an interaction, copy it. Originality is reserved for things they got wrong.

**Why.** Our user's value is their existing fluency. Every novel gesture is a tax
on that fluency and a withdrawal from trust. We win on *being there, in the
browser, collaborative* — not on reinventing the right-click menu.

- **Do:** Put the ribbon up top with Home/Insert/Data/View tabs; formula bar with a Name Box on the left; sheet tabs along the bottom. Match the muscle memory (`shell/RibbonControls.tsx`, `FormulaBar.tsx`, `SheetTabs.tsx`).
- **Don't:** Replace the ribbon with a "modern" floating command bar as the *primary* surface, or rename "Freeze Panes" to something friendlier. The command palette (`CommandSearchDialog.tsx`) is an *accelerator*, not a replacement for the discoverable ribbon.

---

### 2. Content-first chrome

> **Rule:** The grid (or page, or canvas) is the product. Chrome earns its height; when in doubt, give the space back to content.

**Why.** Professionals scan large ranges. Every chrome strip competes with rows
of data. We already budget chrome tightly — the whole shell stacks to fixed,
audited heights.

- **Do:** Respect the chrome-height tokens — `--titlebar-h: 64px`, `--toolbar-h: 66px`, `--formula-bar-h: 26px`, `--sheet-tabs-h: 28px`, `--statusbar-h: 24px` (`tokens/spacing.css`). New chrome must fit one of these strips or justify a new fixed token.
- **Don't:** Add a persistent right-hand panel that's open by default, or a banner that lingers after it's read. Panels open on demand and are mutually exclusive (`shell/PanelMutex.tsx`, `PanelRail.tsx`); banners self-dismiss (`PreviewBanner.tsx`).

---

### 3. Density with clarity

> **Rule:** Pack information tightly on a strict 4px grid — but never at the cost of legibility or a clear hit target.

**Why.** This is a dense tool by nature; 13px is the base body size, 11px the
smallest label (`tokens/typography.css`). Density is a feature *only* while every
element stays readable and every control stays clickable. Cramped ≠ dense.

- **Do:** Lay everything out on the 4px scale (`--space-1`…`--space-10`); body copy at `--text-base: 13px`, status-bar stats and badges at `--text-xs: 11px`; lean on **surface-zone contrast and whisper hairlines** for separation, not heavy lines or drop shadows (zones `--color-surface` / `--color-surface-alt` / `--color-surface-strip`; border `--color-border: #e6e9ee`).
- **Don't:** Shrink text below 11px, drop hit targets below the toolbar norm, or "separate" regions by stacking boxes with thick borders and big shadows. Three zones + a 1px hairline is the house style.

---

### 4. Keyboard-first

> **Rule:** Every frequent action has a shortcut, that shortcut matches Excel/Docs, and you can drive the core flows without touching the mouse.

**Why.** Speed is the whole pitch to a power user. The mouse is the fallback, not
the path. A discoverable, *correct* keyboard map is the single biggest signal
that this tool respects expert users.

- **Do:** Honor Excel bindings exactly (`F2`, `Ctrl+;`, `Ctrl+Shift+L`, `Ctrl+Z/Y`); render shortcut chips in JetBrains Mono via `--font-mono`, platform-correct (⌘ on Mac) using the existing `shortcut-format.ts`; keep `KeyboardShortcutsDialog.tsx` complete and current; offer `Ctrl+/` palette as an accelerator.
- **Don't:** Invent a shortcut that collides with a native Excel one, ship a feature reachable only by mouse, or render a Mac shortcut with Windows glyphs (the bug `formatShortcut` exists to kill — never regress it).

---

### 5. Calm, purposeful motion

> **Rule:** Motion confirms a change and orients the eye — fast and quiet. Nothing bounces for delight.

**Why.** Spreadsheet work demands responsiveness; sluggish or showy animation
reads as a slow, unserious tool. Our motion is deliberately quick (80–140ms
class) with a *gentle* spring for placed surfaces, and it collapses entirely
under reduced-motion.

- **Do:** Use the one shared motion vocabulary — `--motion-fast: 90ms` for hovers/toggles, `--motion-base: 160ms` for control state, `--motion-slow: 240ms` for overlay entrances; `--ease-out` for direct manipulation, `--ease-spring` (subtle overshoot) for menus/panels/dialogs. Attach the ready-made classes (`.cs-anim-pop`, `.cs-anim-panel`, `.cs-anim-rise`, `.cs-anim-up`) so every overlay enters the same way (`tokens/motion.css`).
- **Don't:** Animate the grid, exceed ~240ms, add custom one-off easings, or skip the `prefers-reduced-motion` path (it already degrades to a 1ms fade — keep it).

---

### 6. Trustworthy & professional

> **Rule:** The user must always know the state of their data — saved, syncing, who else is here — and never be surprised. Restraint reads as competence.

**Why.** This file is someone's quarterly model. Trust is the product. Ambiguity
about save state, or a flashy surprise, costs trust faster than any missing
feature.

- **Do:** Keep save/sync state always visible and honest (`SaveStatusPill.tsx`, `ActivityPill.tsx`, `save-status-context.tsx`); show presence calmly (`CollabIndicator.tsx`, `NamePill.tsx`); use the semantic status palette literally — `--color-success #15803d`, `--color-warning #b45309`, `--color-danger #b91c1c` — with their soft fills for badges and banners; reserve the `--accent-gradient` for the single primary CTA and hero marks only.
- **Don't:** Say "Saved" before the write lands, hide sync failures, splash the teal gradient across multiple buttons, or use red for anything that isn't an error/destructive action. One accent, used sparingly, is a trust signal.

---

### 7. Recognizably one suite

> **Rule:** Sheet, Doc, Slides, and Drive are obviously siblings. Same bones; only the accent changes per product.

**Why.** Cross-product credibility and zero relearning cost. A Doc user dropping
into Sheet should feel home immediately. Consistency *is* the brand.

- **Do:** Share every token across products; switch only `--color-accent` and derivatives per app (Sheet teal `#0e7490`, Doc cyan `#0891b2` via `tokens/editor-theme.css`, Slides red, Desktop orange — see the `--suite-*` tokens). Keep typography, spacing, shape, motion, and chrome structure identical.
- **Don't:** Give Doc a different type scale, give Slides rounder corners, or let one product drift its spacing grid. Per-product personality is the accent color and the content model — nothing else.

---

### 8. Mobile is a viewer, not a port

> **Rule:** On phones, optimize for read + one quick edit. Never cram desktop chrome onto a 360px screen.

**Why.** The mobile job is "open it, look, maybe fix one cell, send it on." Trying
to deliver the full editor on a phone fails at both jobs. Honest scoping beats a
broken miniature.

- **Do:** Collapse to a compact menu strip + the mobile action bar (`MobileActionBar.tsx`), support scroll, sheet switching, single-cell value edits, and basic formatting; keep any input font-size ≥16px to stop iOS focus-zoom; respect the breakpoints at `@media (max-width: 720px)` / `(max-width: 480px)` in `apps/web/src/styles.css`; let Univer's canvas own its own touch gestures.
- **Don't:** Surface chart-insert dialogs, the pivot field list, or any hover/right-click-dependent flow on phone — and never wrap the canvas's native touch handling.

---

## Quick reference — what these principles forbid

- A novel primary interaction where Excel/Docs already has a learned one.
- New chrome that doesn't map to a fixed `--*-h` height token.
- Text under 11px, or separation by heavy borders/shadows instead of surface zones.
- A frequent action with no shortcut, a colliding shortcut, or a mis-rendered platform chip.
- Motion over ~240ms, custom easings, or any animation that ignores reduced-motion.
- "Saved" before the write lands; the accent gradient on more than the one primary CTA; red for non-errors.
- Per-product drift in type/spacing/shape/motion — only the accent may change.
- Desktop dialogs forced onto phones, or inputs under 16px on iOS.

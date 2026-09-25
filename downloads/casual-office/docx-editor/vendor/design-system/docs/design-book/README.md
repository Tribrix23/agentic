# The Casual Office Design Book

The single source of truth for how the Casual Office suite — **Sheet, Doc,
Slides, Drive** — looks, moves, and behaves. It is the spec the redesign builds
*to*: when a surface and this book disagree, the surface is wrong.

This is a **target redesign spec**, not a greenfield invention. Every rule here
is grounded in the design system we already ship — [`@schnsrw/design-system`](../../) —
and traces to a real token in `src/tokens/*` or real shell behavior in
`services/sheet/apps/web/src/shell/*`. There is no new palette, type scale, or
motion language to learn; the book documents the *intent* behind the tokens and
makes the implicit decisions explicit. **Tokens are the only API: no raw hex, no
magic px, ever.**

The worked example throughout is the **Sheet** editor — the densest, most
keyboard-demanding surface, held to the Microsoft Excel / Office bar. Doc (Google
Docs bar) and Slides reuse the same bones and diverge only where their content
model demands it; those divergences are called out inline.

## Who this is for

Anyone building or reviewing chrome for the suite — engineers, designers, and
reviewers. Read the section that covers what you're touching before you touch it;
a literal hex, a one-off easing, or a novel shortcut is a review blocker, and
this book is the standard a review checks against.

## The sections

| # | Section | In one line |
|---|---------|-------------|
| 01 | [Principles & Product Voice](./01-principles.md) | The constitution — eight principles (familiarity, content-first, density, keyboard-first, calm motion, trust, one suite, mobile-as-viewer) and the voice everything answers to. |
| 02 | [Foundations (look)](./02-foundations.md) | The raw material — color zones, the three type families, the 4px spacing grid, radius ladder, elevation, and Material Symbols iconography. |
| 03 | [Layout grammar](./03-layout.md) | The shell as one CSS grid — fixed chrome strips bracketing one elastic canvas, the chrome-height budget, alignment, and the ~360px responsive floor. |
| 04 | [Panels & side surfaces](./04-panels-sidebar.md) | The three surface tiers (docked panel / dialog / popover), the 320px rail, the single-occupant mutex, and the concrete panels. |
| 05 | [Motion & animation UX](./05-motion.md) | Motion as wayfinding — three durations, three eases, six keyframes; the grid never animates; per-surface specs and the new-motion checklist. |
| 06 | [Interaction & behavior](./06-behavior.md) | The behavioral contracts — selection, Excel-parity keyboard model, focus management, control states, feedback tiers, and command surfaces. |
| 07 | [Components & patterns](./07-components.md) | The primitive library — buttons, forms, display chips, overlays — with when-to-reach-for-each, states, and composition patterns. |

Read in order for the first pass: 01 sets the *why*, 02–03 the *material and
frame*, 04–06 the *behavior*, 07 the *parts*.

## How to use this book

- **Read before you build.** Open the section that governs your surface first.
  Building chrome without it is how drift starts.
- **The "Do / Don't" lines are normative.** They are decisions, not suggestions.
  A PR that violates one needs a documented reason, not a preference.
- **Tokens over literals, always.** Every color, size, radius, shadow, duration,
  and font comes from a `--*` token. A raw hex or `7px` in a component is a bug,
  not a style choice.
- **One suite, one set of bones.** Type, spacing, shape, motion, and chrome
  structure are identical across Sheet / Doc / Slides / Drive. Only the accent
  color and the content model change per product — nothing else.
- **When the book is silent, don't invent — extend.** Need a new chrome height,
  elevation step, or motion class? Add a token to `src/tokens/*` and document the
  decision here, in the same tight, decision-oriented tone. Don't hand-roll a
  one-off in a component.
- **When the book and a shipped surface disagree,** the book is the target. Fix
  the surface, or — if the book is genuinely wrong — change the book in the same
  PR. Never leave them out of sync.

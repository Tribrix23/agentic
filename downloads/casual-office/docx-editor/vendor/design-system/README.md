# @schnsrw/design-system

Shared design system for the Casual Office suite — Casual Sheets, Casual Editor (docs), and Casual Drive. Ships:

- **Tokens** — one CSS file (`tokens.css`) with 137 custom properties covering colours, typography, spacing, shadows, motion, and chrome layout heights. Light + dark themes share the same names; `[data-theme='dark']` swaps the values.
- **Icon system** — Material Symbols Outlined ligatures via a single `<Icon>` component.
- **Primitives** — Button, IconButton, Input, Select, Checkbox, Switch, Badge, Pill, Avatar, AvatarStack, Card, Kbd, Dialog, Menu, Tooltip, Tabs.
- **Brand assets** — suite product marks.

## Install

```bash
pnpm add @schnsrw/design-system
```

Peer dependencies: `react` and `react-dom` 18 or 19.

## Use

Import the tokens stylesheet once at the app entry point. Importing it loads the three product webfonts (Inter, JetBrains Mono, Manrope) and the Material Symbols Outlined variable font from Google Fonts, plus every CSS custom property used by the primitives.

```ts
import '@schnsrw/design-system/tokens.css';

import { Button, Icon } from '@schnsrw/design-system';

export function Demo() {
  return (
    <Button variant="primary" icon="share">Share for co-editing</Button>
  );
}
```

## Dark mode

Set `data-theme="dark"` on `<html>` (or any ancestor) and every token swaps. Toggle however you like:

```ts
document.documentElement.dataset.theme = 'dark';
```

## Token names

The vocabulary mirrors the design bundle:

- Colour: `--color-accent`, `--color-bg`, `--color-surface*`, `--color-border*`, `--color-text*`, `--color-success|warning|danger|info`, `--suite-{sheets,editor,slides,desktop}`
- Type: `--font-{sans,mono,display}`, `--text-{xs,sm,base,md,lg}`, `--display-{sm,md,lg}`, `--weight-*`, `--leading-*`, `--tracking-*`
- Layout: `--space-{0..10}` (4px grid), `--radius-{sm,md,lg,xl,pill}`
- Elevation: `--shadow-{1..4}`, `--glow-accent`
- Motion: `--motion-{fast,base,slow}`, `--ease-{out,in-out,spring}`
- Chrome heights: `--titlebar-h`, `--toolbar-h`, `--formula-bar-h`, `--sheet-tabs-h`, `--statusbar-h`

## Status

`0.1.0` — first cut, pre-publish. Consumed by sheet SDK, docs SDK, and Drive web app.

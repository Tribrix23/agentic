---
'@casualoffice/docs': patch
---

Formatting bar: keyboard-shortcut hints in tooltips are now platform-correct. The bar hardcoded ⌘ glyphs, so Windows/Linux users saw Mac shortcuts (e.g. "⌘B" instead of "Ctrl+B"). Every hint now routes through the existing `formatShortcut()` helper, matching the main toolbar.

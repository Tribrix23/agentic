---
'@casualoffice/docs': patch
---

Touch editing: set `touch-action: pan-x pan-y` on the paged editor canvas so a tap places the caret immediately (no 300ms delay) and never triggers the browser's double-tap zoom, while one-finger scroll and the custom two-finger pinch-zoom keep working. No effect on desktop mouse input. Adds a Playwright regression test that a real touchscreen tap positions the caret for editing.

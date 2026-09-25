---
'@casualoffice/docs': patch
---

Mobile: auto fit-to-width on phone mount. On a phone-width viewport (≤720px) the editor now scales the page to fit the screen on load, so a Letter/A4 page (~816px) no longer overflows at 100% zoom and forces the user to pinch just to read it. Only shrinks (never zooms in), only when the host didn't pass a custom `initialZoom`, and has no effect on desktop.

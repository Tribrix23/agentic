---
'@casualoffice/docs': patch
---

Fix native form controls (unstyled inputs/selects) rendering with a dark background in light mode when the browser/OS itself prefers dark. `color-scheme` was only set for the dark case; the app's chosen light theme now explicitly sets `color-scheme: light` too, instead of falling through to the page's `light dark` meta default (which let the raw OS preference win over the app's own theme choice).

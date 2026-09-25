---
'@casualoffice/docs': patch
---

Fix anchored text boxes in headers/footers rendering far off the page: their `offsetH`/`offsetV` (EMUs) were used raw as pixels instead of converted, throwing the box and its text/tags ~9525× too far. Now converted via `emuToPixels` like every other anchor offset.

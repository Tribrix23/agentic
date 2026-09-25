---
'@casualoffice/docs': patch
---

Fix linked (externally-referenced) images, and images whose data is missing, being silently dropped on open. They are now kept — shown as a labelled placeholder — and their relationship reference survives a round-trip save instead of being lost.

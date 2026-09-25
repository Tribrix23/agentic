---
'@casualoffice/docs': patch
---

Fix Find so it searches as you type: editing the query now re-runs the search (debounced) and keeps the result in sync, instead of requiring Enter and getting stuck showing a stale "No results found" for text that actually matches (or navigating the previous term's matches).

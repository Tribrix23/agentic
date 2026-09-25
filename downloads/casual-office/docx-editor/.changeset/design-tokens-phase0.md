---
'@casualoffice/docs': patch
---

Author a self-contained design-token layer (`styles/tokens.css`) and stop importing the empty vendored design-system stub. The editor now owns its own color / shadow / motion / font / space / radius primitives (light + dark) instead of resolving them from scattered inline fallbacks, so the chrome renders from one coherent system. No public API change.

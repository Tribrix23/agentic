---
'@casualoffice/docs': patch
---

Honesty fixes for two over-promising UI surfaces:

- The offline reconnect banner no longer claims edits are "saved locally and will sync" — there is no local persistence provider yet, so closing the tab while offline loses them. It now says "keep this tab open and your edits will sync when the connection returns."
- The share dialog's security note now states plainly that a view/comment link can currently be escalated to edit by removing the URL parameter, and to only share such links with trusted people until server-enforced secure links land.

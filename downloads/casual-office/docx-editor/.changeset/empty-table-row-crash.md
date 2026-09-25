---
'@casualoffice/docs': patch
---

Fix a document failing to open (throwing "Invalid content for node tableRow") when it contains a table row fully covered by a vertical cell merge — e.g. a single-column table with a cell merged down several rows. Such rows now render with a placeholder cell instead of crashing the whole document.

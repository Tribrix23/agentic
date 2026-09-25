---
'@casualoffice/docs': patch
---

Fix File → Open silently discarding unsaved edits. Opening another document while the current one has unsaved changes now asks for confirmation first (the beforeunload guard only covered tab close/reload, not in-app document replacement).

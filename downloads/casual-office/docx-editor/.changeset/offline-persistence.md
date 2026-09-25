---
'@casualoffice/docs': patch
---

Add offline persistence for collaborative sessions: the Y.Doc is mirrored into IndexedDB (keyed by room), so edits survive a page reload or an offline session and merge back up on reconnect. The autosave safety gate is unchanged — it still waits for the server, so there is no blank-document overwrite.

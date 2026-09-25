---
'@casualoffice/docs': patch
---

Comments: deleting a comment thread now requires a confirmation. Deletion is destructive and not undoable, but was a single unguarded click in the ⋮ menu — a stray click lost the thread. The menu now arms a distinct "Delete this comment?" confirm (Delete / Cancel) before removing it.

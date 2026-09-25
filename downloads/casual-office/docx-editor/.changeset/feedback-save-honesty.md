---
'@casualoffice/docs': patch
---

Feedback fixes so a failed save can't look like a successful one:

- Manual save (Ctrl+S / File → Save) now shows a toast on failure — both when serialization returns no bytes and when the save throws — instead of failing silently.
- The autosave indicator no longer reverts to a stale "Saved X ago" after a failed autosave: a new `pendingError` flag (kept until the next successful save, surviving the error-badge auto-clear) makes it show "Unsaved changes" instead.

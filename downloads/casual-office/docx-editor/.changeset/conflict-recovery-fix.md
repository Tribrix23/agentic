---
'@casualoffice/docs': patch
---

Fix the save-conflict recovery path. After a WOPI 409 / personal 412 the autosave loop correctly paused (no data loss), but a user-initiated "Save anyway" (`flush()`) could never succeed — it re-sent the stale version and conflicted forever. Now the host's current version (`actual`) is surfaced on the conflict error (WOPI already did; personal now reads it from the response `ETag`) and adopted so the force-save overwrites successfully. Also stops a spurious conflict when the initial etag resolves after a save already advanced it.

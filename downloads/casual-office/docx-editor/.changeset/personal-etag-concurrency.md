---
'@casualoffice/docs': patch
---

Data-loss fix: thread the etag through personal-mode autosave. The etag from `FileSource.open()` is now seeded into `useFileSourceAutoSave`, sent as `If-Match` on every save, and refreshed from each save result. A concurrent host-side change (or a second tab) now surfaces as a 412 conflict instead of a silent last-write-wins overwrite.

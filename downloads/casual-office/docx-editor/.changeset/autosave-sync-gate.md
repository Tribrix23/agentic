---
'@casualoffice/docs': patch
---

Data-loss fix: gate FileSource autosave on collab initial sync. In collaborative mode the editor mounts with an empty seed document while the real content arrives over Yjs; autosave could serialize and push that empty seed before sync completed, overwriting the stored `.docx` with a blank document. `useCollab` now exposes a `synced` flag and `useFileSourceAutoSave` accepts an `isReady` gate so no save runs (and the editor is never even serialized) until the document is ready.

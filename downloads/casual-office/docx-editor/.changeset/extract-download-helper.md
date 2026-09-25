---
'@casualoffice/docs': patch
---

Internal: extract the duplicated browser-download logic (object URL → hidden `<a download>` → click → deferred revoke) from DocxEditor's four save/export handlers into a single `triggerBrowserDownload()` utility. Pure refactor, no behavior change — first IO-primitive step of the DocxEditor decomposition.

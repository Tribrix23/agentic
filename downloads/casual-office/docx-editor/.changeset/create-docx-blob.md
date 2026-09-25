---
'@casualoffice/docs': patch
---

Internal: extract the `.docx` Blob construction and its OOXML MIME type from three copy-pasted sites in DocxEditor into a `createDocxBlob()` helper and a `DOCX_MIME` constant. Pure refactor, no behavior change.

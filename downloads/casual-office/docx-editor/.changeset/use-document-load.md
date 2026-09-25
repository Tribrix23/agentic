---
'@casualoffice/docs': patch
---

Internal: extract the document-load path (buffer parsing, generation guard, server-version restore) out of the DocxEditor component into a `useDocumentLoad` hook. No behaviour change.

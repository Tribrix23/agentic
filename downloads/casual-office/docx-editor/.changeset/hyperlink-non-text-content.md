---
'@casualoffice/docs': patch
---

Fix non-text content inside a hyperlink (a clickable image, a table-of-contents leader tab, a line break, a symbol) being silently dropped on open. It is now preserved instead of only the link's text surviving.

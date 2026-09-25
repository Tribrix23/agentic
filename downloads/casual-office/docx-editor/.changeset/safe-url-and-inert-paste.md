---
'@casualoffice/docs': patch
---

Security: reject dangerous URL schemes (`javascript:`, `data:`, `vbscript:`, …) on all hyperlink and linked-image hrefs, and parse pasted HTML in an inert document instead of assigning it to a live element's `innerHTML`. Closes two stored/paste XSS vectors where a crafted `.docx` or clipboard payload could execute script in the editor origin.

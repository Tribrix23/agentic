---
'@casualoffice/docs': patch
---

Fix content being dropped from documents with a table of contents or other complex field that spans multiple paragraphs. The field's instruction and visible text in its opening paragraph are now preserved instead of silently discarded.

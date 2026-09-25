---
'@casualoffice/docs': patch
---

Fix documents with a block-level content control (SDT) whose title/tag contains `&`, `<`, or `"` saving as a corrupt .docx that Word refuses to open. The alias/tag are now XML-escaped, matching the inline content-control path.

---
'@casualoffice/docs': patch
---

Implement kinsoku shori (East Asian forbidden line-start/end character rules, OOXML `w:kinsoku`) for CJK text wrapping. Closing punctuation/brackets, small kana, and similar characters no longer start a line orphaned from the content before them — the line is extended to include them instead, matching Word/LibreOffice behavior.

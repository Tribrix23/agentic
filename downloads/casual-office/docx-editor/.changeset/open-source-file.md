---
'@casualoffice/docs': minor
---

Add an `onOpenSourceFile` prop to `DocxEditor`: when File → Open picks a plain-source file (`.md`/`.txt`/`.rtf`/`.eml`), the host can open it in a dedicated markdown/source viewer instead of the editor converting it to DOCX. Fixes `.md` files opening as garbled DOCX from the in-editor File → Open.

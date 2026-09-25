---
'@casualoffice/docs': patch
---

Internal: extract the export/print base-filename computation (trim the title, strip a trailing `.docx`, fall back to a default) from six copy-pasted sites in DocxEditor into a `documentBaseName()` utility. Pure refactor, no behavior change (the title-case vs lower-case fallback difference is preserved via a parameter).

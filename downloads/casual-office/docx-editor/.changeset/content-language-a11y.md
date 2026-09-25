---
'@casualoffice/docs': patch
---

Accessibility (WCAG 3.1.1): the editor now carries a `lang` on its root so assistive tech pronounces document content in the right language, and the off-screen editable surface (what screen readers read) inherits it. Adds a `documentLang` prop (BCP-47); defaults to the host page's `<html lang>`, then `en`.

---
'@casualoffice/docs': patch
---

When a document fails to open in the editor, the error screen is no longer a dead-end: it now offers a "Try again" action (a full reload by default, overridable via a new `onRetry` prop on the error view) so the user can recover instead of being stuck.

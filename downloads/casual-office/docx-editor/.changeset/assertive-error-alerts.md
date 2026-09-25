---
'@casualoffice/docs': patch
---

Give the two genuinely blocking error surfaces — the crash fallback (`ErrorBoundary`'s default UI) and the DOCX parse-error display — `role="alert"` so screen readers announce them immediately, matching the pattern `PanelState`'s error state already used. The exported `NotificationToast` (public `useErrorNotifications()` API) now does the same for `severity: 'error'` notifications specifically; non-blocking warnings are unaffected.

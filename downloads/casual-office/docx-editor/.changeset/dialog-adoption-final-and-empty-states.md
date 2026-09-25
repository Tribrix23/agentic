---
'@casualoffice/docs': patch
---

Finish the dialog adoption sweep — Dictionary, Image Position, Insert Image, Explore, Translate Document, and Keyboard Shortcuts now use the shared Dialog shell (19 dialogs total on one consistent modal chrome). Also route the spell-suggestions menu and the AI suggestion panel through the shared PanelState primitive so their empty / loading / error states are designed rather than bare text.

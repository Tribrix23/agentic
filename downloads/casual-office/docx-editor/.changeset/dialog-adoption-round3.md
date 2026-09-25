---
'@casualoffice/docs': patch
---

Migrate six more dialogs (File Properties, Table Properties, Image Properties, Citations, Building Blocks, Translate) onto the shared Dialog shell. Bookmarks, Paste Special, and Borders & Shading were deliberately left as modeless popovers (they position against page content / apply live, which a modal backdrop would break). Thirteen dialogs now share one consistent modal chrome.

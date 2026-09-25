---
'@casualoffice/docs': patch
---

Internal: begin decomposing the large `DocxEditor` component by moving its modal dialog open/close state into a single `useDialogs` registry. First batch migrates 10 modals (Page Setup, File Properties, Word Count, About, Keyboard Shortcuts, Preferences, Watermark, Accessibility, Building Blocks, Dictionary) off individual `useState` booleans. No behavior change.

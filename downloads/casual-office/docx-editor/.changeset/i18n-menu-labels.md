---
'@casualoffice/docs': patch
---

Route the 26 remaining hardcoded English menu-item labels (New, Undo, Redo, Cut, Copy, Paste, Find, Select all, Zoom in/out, Export as PDF/ODT/Markdown/Plain Text, the Edit/View menu labels, and others) through the existing `t()` i18n system, so every string in the menu bar is now translatable. Rendered English text is unchanged.

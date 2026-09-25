---
'@casualoffice/docs': minor
---

Fix undo/redo in collaboration mode: Ctrl/Cmd+Z and Ctrl+Y (Cmd+Shift+Z) now drive y-prosemirror's local-scoped UndoManager. Previously undo was completely inert in a collab session — the native history plugin is disabled there and the y-undo manager was never bound to a keymap.

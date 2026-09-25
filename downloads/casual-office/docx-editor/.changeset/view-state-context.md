---
'@casualoffice/docs': patch
---

Internal refactor: extract the 7 view-toggle pairs (spellcheck, grammar, outline, show-ruler, show-vertical-ruler, show-formatting-marks, paint-format) from 14 individual props on the internal `<EditorToolbar>` call site into a `ViewStateContext`, matching the existing `DialogActionsContext` pattern. No public API change — the corresponding `ToolbarProps` fields are unchanged and still take precedence when explicitly passed. Part of the ongoing `DocxEditor.tsx` decomposition (docs/internal/40 §6).

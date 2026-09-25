---
'@casualoffice/docs': patch
---

Fix a selective-save data-loss window: a paragraph re-edited while the previous save was still serializing could have its change-tracker entry cleared, dropping that edit from the next save. Re-edited paragraphs are now retained until they're actually serialized.

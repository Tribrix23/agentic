---
'@casualoffice/docs': patch
---

Fix double-clicking a header/footer to edit it: in a multi-section document, editing what's shown on a non-final section's page silently read from AND wrote to the document's LAST section's header/footer file instead of the clicked page's own section — a data-corruption risk where an edit could overwrite unrelated content. Double-click now resolves and saves to the clicked page's own section.

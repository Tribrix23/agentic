---
'@casualoffice/docs': patch
---

Fix header/footer rendering in multi-section documents: every page used to show the SAME header/footer (whichever section's reference the resolver found last while scanning the whole document), instead of each page showing its own section's header/footer. A section with no header/footer reference at all (e.g. a title page) could even inherit a later section's header. Headers/footers, w:titlePg, and page orientation/size now resolve per-page from that page's own section.

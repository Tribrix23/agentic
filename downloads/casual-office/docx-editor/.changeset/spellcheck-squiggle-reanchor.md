---
'@casualoffice/docs': patch
---

Fix spellcheck/grammar squiggle underlines (and other DecorationLayer overlays — search highlights, remote cursors) staying at their old screen position when the canvas shifts without a document change, e.g. opening the Format panel. They now re-anchor on the same reflow signal `ImageSelectionOverlay` already uses.

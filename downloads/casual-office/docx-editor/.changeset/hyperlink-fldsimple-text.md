---
'@casualoffice/docs': patch
---

Preserve hyperlink text when the link wraps a simple field (`<w:fldSimple>`), e.g. a PAGEREF/REF cross-reference or TOC entry — previously such links rendered empty and lost their text on round-trip.

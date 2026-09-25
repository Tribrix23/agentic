---
'@casualoffice/docs': patch
---

Fix anchored text boxes (page/margin/paragraph-positioned shapes, including VML-authored ones) rendering with their real offset collapsed toward zero. `anchor.offsetH/offsetV` are pixels by the time they reach the renderer (converted once from EMU at parse time), but the header/footer and body-flow painters were converting them from EMU to pixels a second time, shrinking any real offset to a fraction of a pixel. Most visible in headers/footers with multiple positioned text boxes (e.g. a title box and a product-info box), which all collapsed toward the same spot and rendered as overlapping garbled text.

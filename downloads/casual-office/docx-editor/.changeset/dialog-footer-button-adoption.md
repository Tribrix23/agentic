---
'@casualoffice/docs': patch
---

Migrate every dialog's footer action buttons (Cancel/Apply/Close/Insert/etc.) onto the shared `Button` primitive, so all 19 shared-shell dialogs now render their actions through one component with consistent sizing, focus rings, hover, and disabled states, instead of 19 sets of hand-rolled inline styles.

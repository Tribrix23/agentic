---
'@casualoffice/docs': patch
---

Fix an oversized or full-width floating image collapsing wrapped text to about one character per line (with the paragraph's height ballooning and pushing following content off the page). The text column beside a float is now kept to a minimum width.

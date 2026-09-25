---
'@casualoffice/docs': patch
---

Security hardening: strip the WOPI `access_token` from the visible URL via `history.replaceState` once it's captured in memory (stops it leaking through history / referrer / screen-share); send only origin+pathname (never the query string) in bug-report links; and reject postMessage frames with an empty/absent origin in the embed transport instead of treating them as trusted.

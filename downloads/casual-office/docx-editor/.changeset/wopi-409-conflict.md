---
'@casualoffice/docs': patch
---

Data-loss fix: handle save version conflicts instead of retrying forever. On a WOPI 409 the source now adopts the host's current version (so the stale `X-WOPI-ItemVersion` isn't re-sent on every tick), and the autosave hook treats a conflict (WOPI 409 / personal 412) as a durable, non-auto-clearing state that pauses the auto-loop and hide-flush — surfaced via a new `conflict` flag — so it can't silently lose edits or overwrite the other writer. An explicit `flush()` clears the pause as a deliberate overwrite.

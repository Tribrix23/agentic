---
'@casualoffice/docs': patch
---

Fix edits made while a save is in progress being silently dropped. During the async document serialization, a local keystroke — or a remote collaborator's edit — that lands on another paragraph is now preserved and saved on the next tick, instead of being cleared from the change tracker and lost.

# 37 — SDK + Collab initiative

_From the 2026-07-07 four-stream analysis (collab UX, AI-via-collab, current SDK surface, peer-SDK patterns). Tracked in **GitHub Project "Casual Editor — SDK & Collab"**: https://github.com/orgs/CasualOffice/projects/2 — issues filed in docs/sheets/collab, per-repo progress visible via the board's Repository field._

## Goal

Ship both editors as an **installable, client-side npm SDK** that feels **native** in a host app: `read` vs `editor` modes, single-user by default, real-time when a collab URL + room (fileId) is passed, and full programmatic control — events, hooks, inject/replace handlers, hide/disable features. Docs **and** sheets, one contract.

## What already exists (don't rebuild)

- **Docs:** `DocxEditor` + `CasualEditor` + `CasualEditorIframe` + `renderAsync`; `embed/protocol.ts` postMessage contract; rich `DocxEditorRef`; `--doc-*` token theming.
- **Sheets:** `@casualoffice/sheets` SDK pkg — `CasualSheets`/`CasualSheetsIframe`/`CasualSheetsAPI`, `attachCollab()`, `features` flag map + `ChromeExtensions` slots.
- **Collab:** Node Hocuspocus+Yjs server; presence/cursors/comments **exist** (docs `PresenceCluster` now **mounted** in `CasualEditor.tsx` — docs#262; sheets richer); share-token infra exists (workbook-oriented).
- The shared `casual.*` envelope (`app:'docs'|'sheet'`) makes SDK convergence realistic.

## Peer north-star (SuperDoc / Tiptap / Univer / Liveblocks / Lexical)

8 must-adopt patterns: (1) one declarative config + **dual mount** (React component AND imperative ctor); (2) an **imperative handle** with a stable method surface; (3) **3-value `documentMode`** (edit/view/suggest) not a boolean; (4) **dual events** (config map AND `.on()/off()`) with a catalog; (5) **feature-flag/slot** system to hide UI by id; (6) **extension API** that adds AND replaces behavior; (7) **collab-by-config**, provider-agnostic; (8) **style isolation** + token vars + `cspNonce`. Anti-patterns: no React component, no collab-by-config.

## Phases (see project #2 for the tracked issues)

- **Phase 1 — Collab UX:** docs share/permission UI (docs#261); mount PresenceCluster — ✅ **shipped**, docs#262 (`CasualEditor.tsx`); default reconnect UI (docs#263); **P0 security**: anonymous `?role=comment` grants write (collab#9).
- **Phase 2 — AI via Collab:** ✅ **shipped** (#276, #284, #279) — agent mode decoupled from `drivesLoop`; AI edits attributed to the user not "DocOps AI"; AI-editing presence rendered w/ identity.
- **Phase 3 — SDK Core:** ✅ **shipped** — `documentMode` (#282); AI promoted to an `ai={}` SDK prop (#285). Component-contract unification tracked with these.
- **Phase 4 — Events & Hooks:** ✅ **shipped** (#288) — normalized imperative handle + dual events surface (config map AND `.on()`/`.off()`).
- **Phase 5 — Native Feel:** ✅ **shipped** — `features` flag-map + toolbar slots (#289/#293); `chrome:'embedded'` (#304/#308). Extension API add+replace and full style isolation still tracked.

## Sequencing

Do **Phase 1–2 first** (collab UX + AI-via-collab fixes — several are P0/security and unblock the SDK's collab + AI story), then the SDK Phases 3→5. Each phase's issues are tagged in the board with Phase + Priority; mark progress there per repo.

_Status (2026-07-19): Phases 2–5 have **largely shipped** (see the ✅ markers above); Phase 1's PresenceCluster mount landed (docs#262). Remaining open: Phase 1 share/permission + reconnect UI and the collab#9 P0, plus Phase 5's extension API and full style isolation._

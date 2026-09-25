# 23 — Collab server migration (shared Hocuspocus + Yjs)

Status: **complete** — the Go gateway (`backend/`) was **removed 2026-06-28**. The editor
connects to the collab server via `HocuspocusProvider`; the share-link/seed flow moved to
collab's `/api/rooms`; Mode 2/3 (auth, files, WOPI) were already collab-contract-native; the
bundled Docker image now runs the collab server (Node) serving the SPA + REST + WS on one
origin (`Dockerfile`, `docker-compose.yml`, `deploy/`). Continues pillar C of
[22-collab-scale-persistence](./22-collab-scale-persistence.md).

> **2026-06-28 removal note.** The REST surface the Go gateway used to own is now fully
> covered by collab: realtime WS (`/yjs`), share-link/seed (`/api/rooms`), personal auth
> (`/auth`), personal files (`/files`), and WOPI (`/wopi`). The opt-in server version-history
> endpoint (`/api/docs/:id/history`) has no collab equivalent — it was dropped from the demo
> (local IndexedDB history still works). `docs/internal/05-backend-design.md` + `12-env-vars.md`
> describe the removed Go code and are historical.

## Decision

Replace the Go gateway's **relay-only** collaboration role with a shared, real-Yjs
server that holds one authoritative `Y.Doc` per room. Rather than build a Go CRDT
(experimental, no mature Y.Xml support) we **lifted the sheet app's existing
Hocuspocus server** into a standalone repo and made it product-agnostic, so a single
codebase serves both Docs and Sheets.

- Repo: **`github.com/CasualOffice/collab`** — Hocuspocus + Yjs + auth + file
  persistence (memory / local / s3 / postgres) + WOPI + snapshots/versioning.
- Vendored into this repo as a **git submodule** at `./collab`.
- **Format-agnostic**: `src/host/format.ts` derives storage keys, download
  Content-Types and default filenames from `CASUAL_FILE_EXT`
  (docs → `.docx`, sheets → `.xlsx`, default `.xlsx`). The server stores opaque
  OOXML bytes; all `.docx` knowledge stays in the editor client.

## Why this resolves pillar C (and D)

Hocuspocus maintains the authoritative `Y.Doc`, so:

- **New-peer sync** comes from server state, not a peer re-upload.
- **Snapshots on drain / versioning** are produced server-side (`onStoreDocument`,
  opaque version strings + `If-Match`) — no Bun worker in the prod image.
- The [#43 envelope-in-PM fix](./22-collab-scale-persistence.md) makes the docs
  `Y.Doc` self-sufficient, so these server snapshots preserve drawings.

## Client change

`packages/react/src/collab/useCollab.ts` now uses `HocuspocusProvider`
(`@hocuspocus/provider`, optional peer dep) instead of `y-websocket`'s
`WebsocketProvider`. The hook's public API is unchanged, so `CasualEditor`
consumers are unaffected. The room name travels in the Hocuspocus handshake, so
`backend` is the bare ws endpoint (e.g. `ws://localhost:1234/yjs`), not a path
prefix. Anonymous `write` works by default (the server reads share tokens from the
`?share=` query, not the Hocuspocus `token`).

The `examples/vite` demo's `useCollab` is now a thin **re-export shim** to the library
hook (`export … from '@casualoffice/docs'`), so the example rides the same
`HocuspocusProvider` path as every consumer — no separate Go-gateway copy remains.

## Proven

Headless test against the server in docs mode (`CASUAL_FILE_EXT=.docx`):

1. Two `HocuspocusProvider` peers on one room — edits in A converge to B. **PASS**
2. Both peers dropped, a **fresh** peer joins — receives the content from the
   server's authoritative `Y.Doc`. **PASS** (server-held state → pillar C).

## Run locally

```bash
# Option A — submodule via docker-compose (dev profile)
git submodule update --init
docker compose --profile dev up   # collab-dev on :1234 (docs mode)

# Option B — directly
cd collab && npm install && CASUAL_FILE_EXT=.docx npm run dev
```

A `CasualEditor` host points `backend` at `ws://localhost:1234/yjs`.

## Done

- **Deploy cutover** — ✅ complete. Production topology is in
  [`deploy/`](../../deploy/README.md) (`docker compose -f docker-compose.prod.yml up`);
  `deploy/Caddyfile` now TLS-terminates and `reverse_proxy`s **everything** to the collab
  `app` on one origin (SPA + REST `/api/rooms` `/auth` `/files` `/wopi` + WS `/yjs`) — no
  split `/yjs`→collab / else→gateway. The live demo is on collab; the Go gateway is removed
  (2026-06-28).
- **Retire the Go gateway's collab role** — ✅ done; the `backend/` gateway was removed
  wholesale on 2026-06-28, not just its collab role.

## Follow-ups (open)

- **Sheets onto the same server** — point the sheet app at the vendored submodule
  (its server is the source of this extraction, so behaviour is unchanged at the
  `.xlsx` default).

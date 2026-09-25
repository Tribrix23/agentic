# 18 — Co-editing Durable Save: Design Options (Phase 2)

**Date:** 2026-06-19 (backend premise re-grounded 2026-07-19)
**Status:** Design only, no code. Decision pending. **NB:** the Go-gateway facts this doc's options B/C were built on were removed 2026-06-28 — the backend is now the Node/TypeScript `CasualOffice/collab` server (Hocuspocus + Yjs on Fastify, vendored at `./collab`), which holds a full authoritative in-memory Y.Doc per room. See the inline `[2026-07-19]` corrections; the options analysis below is retained as history.
**Context:** `docs/internal/17-production-readiness-audit.md` §2 + its 2026-06-19 backend correction. Proving test: `docx-editor/packages/core/src/docx/coedit-envelope-loss.test.ts`.

## The problem, stated precisely

There are **two distinct** co-editing durability gaps. Conflating them is what made "server-side snapshot" sound like one decision when it's really two.

**Gap 1 — the un-serialized final interval.**
Persistence today is 100% client-push: `useFileSourceAutoSave` calls `ref.save({selective:true})` on a ~30s schedule, producing full-fidelity `.docx` (selective-save patches the client's own seed bytes, so envelopes survive). If the last client leaves *between* intervals, the edits made since the last autosave exist **only as Yjs updates the gateway relayed but cannot serialize** (historical Go framing: no Go CRDT lib; serializer is TS; `DrainFunc(docID)` was a no-op — `cmd/gateway/main.go:846`, removed 2026-06-28). Nobody ever turned those edits into bytes, so nobody can recover them. **[2026-07-19] This premise no longer holds:** the Node `CasualOffice/collab` server keeps an authoritative in-memory Y.Doc per room, and its serializer is the same TS pipeline — so drain-time serialization can run in-process (Hocuspocus `onStoreDocument` / unload hook) with no client present. The gap survives only where no drain hook has been wired yet, not because the server structurally cannot serialize.

**Gap 2 — the seed-less peer / from-PM reconstruction.**
The raw-XML envelopes (`Shape.rawXml`) live on the Document model, not in the Y.Doc. Anything rebuilding a Document *from* the Y.Doc drops inline body drawings — proven: `coedit-envelope-loss.test.ts` shows a from-PM serialize loses `<v:rect>`, and **passing the seed to `fromProseDoc` does not save it** (the body is rebuilt from PM; the seed only restores section scaffolding). Today this only bites if a joiner edits without ever holding the seed — which the shipped wrappers avoid (`CollabApp`/`CasualEditor` seed every joiner). It becomes a *hard* requirement only for a server that serializes the Y.Doc itself.

> Key realization: **only a server-side serializer can recover Gap 1.** Options A/B don't serialize; they make a *client* serialize more reliably. If "recover edits no client ever serialized" is a hard requirement, the answer is C. If "make the client reliably serialize before it leaves" suffices, A is enough.

## Verified facts these options build on

- _[historical, Go gateway — removed 2026-06-28]_ `host.Snapshot(ctx, docID, authToken, contents []byte)` existed (`backend/internal/host/host.go:106`); `Locker` retained the first client's token for drain-time Unlock, so a token was available at drain. **[2026-07-19]** the equivalent persistence hooks now live in the Node `CasualOffice/collab` server, not in a Go `host` package.
- _[historical, Go gateway — removed 2026-06-28]_ `DrainFunc(docID string)` — docID only, no contents (`internal/room/manager.go:243`); wired impl was a logging no-op (`cmd/gateway/main.go:846`). **[2026-07-19]** drain is now a Hocuspocus `onStoreDocument` / document-unload hook in `./collab`, which receives the live Y.Doc.
- **[2026-07-19] FALSE as written.** The Node room does **not** merely relay frames: Hocuspocus keeps one authoritative in-memory Y.Doc per room and mutates it in place. The "relays, does not accumulate state / no CRDT dependency" claim described the removed Go gateway and no longer holds.
- Client save preserves envelopes via selective-save against `originalBuffer` (`agent/DocumentAgent.ts:675-693`); a from-scratch `createDocx` does not.

---

## Option A — Client-side flush on unload (lightest) — IMPLEMENTED 2026-06-19

Call `ref.save()` on `visibilitychange`/`pagehide` so the final interval is pushed **before** the tab closes, instead of waiting for the next 30s tick.

> Shipped in `useFileSourceAutoSave.ts`: replaced the old `beforeunload`-only
> handler (which the code admitted "doesn't honour async work") with
> `visibilitychange`→'hidden' (primary) + `pagehide` (backup), avoiding
> `beforeunload` so the bfcache stays enabled. Behavioural test:
> `useFileSourceAutoSave.hide-flush.test.ts` (hidden→save, pagehide→save,
> visible→no-save). "A now + C later" decision; C tracked as the deferred
> follow-up.

**Sequence:** user closes tab → `pagehide` fires → `useFileSourceAutoSave` triggers an immediate `save()` → `FileSource.save()` PUTs full-fidelity bytes to the host (WOPI `PutFile` / inline store) → tab closes.

**Server change:** none. **Runtime/Docker:** unchanged. **Stateless invariant:** untouched.

**Closes:** Gap 1 for the common case (user-initiated close), which is the overwhelming majority of "last interval lost" reports.
**Does NOT close:** hard crash / power loss / network drop mid-flush (no `pagehide`), and Gap 2 (but the shipped wrappers already seed joiners, so Gap 2 isn't live).
**Failure modes:** `pagehide` save is best-effort — browsers cap work during unload; a large selective-save may not finish. Mitigate with `keepalive` fetch + small selective payload. Multiple tabs racing → last write wins (already true).
**Proving test:** unaffected (Gap 2 unchanged) — stays red, correctly documenting that latent gap.
**Cost:** ~half a day, client-only.

## Option B — Server caches last-pushed bytes, re-persists on drain (light)

Gateway remembers the most recent client-pushed `.docx` per room; on drain, if it's newer than what the host last accepted, `host.Snapshot` it.

**Sequence:** each client autosave PUT → gateway caches bytes + bumps a per-room version → on `DrainFunc`, compare cached version vs last-Snapshotted; if newer, call `Snapshot(docID, retainedToken, cachedBytes)`.

**Server change:** extend `DrainFunc` to carry the room (or look up cached bytes + token); add a per-room `lastPushed` buffer. **Runtime/Docker:** unchanged (no serializer). **Stateless invariant:** softened — server now caches document bytes in memory (but doesn't decode/produce them).

**Closes:** races where a client pushed but the host `PutFile` failed/lost, and "host had a stale copy at drain."
**Does NOT close:** Gap 1's core (un-serialized interval — the cached bytes are still only as fresh as the last client push) or Gap 2.
**Failure modes:** memory growth (cache evicted on drain — bounded by live rooms); token expiry at drain (already a risk for Unlock; same mitigation).
**Proving test:** unaffected — stays red.
**Cost:** ~1 day, backend-only. **Marginal value over A** unless host PutFile reliability is a real concern.

## Option C — Server-side serialize on drain (heavy; the chosen-then-reconsidered one)

Gateway accumulates Y.Doc state and, on drain, hands it + the seed to a reintroduced TS/Bun headless worker that serializes via selective-save.

**Sequence:** room appends each relayed update to a per-room Yjs state (raw update bytes — Yjs merges order-independently) → on drain, gateway POSTs `{ yUpdates, seedBytes, docID }` to a Bun worker → worker: `Y.applyUpdate` → `ySyncPlugin` decode → PM doc → `fromProseDoc(pmDoc, seedModel)` → **selective-save against seed bytes** (so untouched drawings keep original XML → envelopes preserved) → returns `.docx` → gateway `host.Snapshot`.

**Server change:** Y.Doc accumulation in the room; a new Bun worker service + the Go→worker call; extend drain to pass state. **Runtime/Docker:** **reintroduces Bun in the prod image** — reverses the M2 pivot (`d24deaa`) that removed exactly this. **Stateless invariant:** **broken** — the backend now accumulates Y.Doc state and produces documents (it becomes document-aware, the thing the architecture deliberately avoided; ironically the property OT would have given for free — see [[project-production-readiness]]).

> **[2026-07-19] This cost analysis is now moot.** It assumed a stateless Go relay that would have to be made document-aware and grow a separate Bun runtime. The current Node `CasualOffice/collab` server already holds an authoritative in-memory Y.Doc per room and already runs the TS serializer in-process, so C's "server-side serialize on drain" no longer means "reintroduce Bun" or "break statelessness" — those were consequences of the removed Go gateway. What remains of C is just wiring the existing serializer into the Hocuspocus `onStoreDocument` / unload hook.

**Closes:** Gap 1 fully (recovers the un-serialized interval — the server can serialize the merged state with no client present) AND Gap 2 (the worker uses selective-save against the seed, so envelopes survive even for a seed-less peer).
**Failure modes:** worker pool availability (drain must not block room teardown — fire-and-forget with retry); Yjs-version skew between the Go-accumulated updates and the worker's `yjs` lib; selective-save correctness when many paragraphs changed (falls back to full repack → re-introduces Gap 2 unless the worker also carries the seed model — it does); double-serialize races if a client also pushed at drain (version-guard via `host.ErrConflict`, already modeled at `host.go:163`).
**Proving test:** the worker's selective-save path is the exact thing that flips `coedit-envelope-loss.test.ts`'s seed assertion from `not.toContain` → `toContain`. That test becomes C's unit-level acceptance gate (the serialize logic is TS and testable without the Go/Bun plumbing).
**Cost:** multi-day, spans Go + a new Bun service + Docker + ops.

---

## Recommendation

**Ship A now; keep C documented as the escalation path.** A closes the gap users actually hit (close tab, lose last 30s) for client-only cost and zero architectural change. B is only worth it if host `PutFile` reliability is a measured problem. C is the only complete answer, but it reverses a deliberate decision, puts Bun back in prod, and makes the backend stateful — justified only when "recover edits that no client ever serialized" (true server-authoritative durability, e.g. compliance/SLA) becomes a hard requirement, not before.

Gap 2 (envelope loss) is **not** a reason to pick C by itself: it isn't live today (joiners are seeded), and it's cheaper to *guard* — assert a joiner has a seed before allowing edits, and keep the `coedit-envelope-loss.test.ts` red flag as the standing reminder — than to stand up a server serializer to paper over it.

**Open question for the decider:** is true server-authoritative durability (recover edits no client serialized; survive client crash/network-drop, not just tab-close) a hard requirement for this product's stage? If no → A. If yes → C, accepting the M2-pivot reversal.

# 34 — Local-AI production rework: two surfaces, formatting-preserving edits, reliable tool-calling

Status: **P0 bug-bar shipped; feature work continued in §6 → north-star doc 36** (updated 2026-07-06). See §6 for the completion log + the docs↔sheet parity matrix.

**Web** (`document`, since shipped via web PRs #236/#242): `9ba7a07` P0 quick wins (error surfacing, tool_use history balance, worker-crash rejection, shared `API_KEY_STORAGE`, transformDoc/research routing); `64a201d` P0-A first-cut (desktop Ask-AI preserves formatting via `rewriteFragmentWith` — unit-proven). See §6 for the merged completion log.

**Desktop** (`desktop`, since shipped via desktop PRs #75-78): `2d959fb` P0-5 kill silent local→cloud egress (local_active flag; require explicit LLM_ENDPOINT); `6e0bde4` P0-6 context budget (TOO_LARGE before prefill) + P1-3 multibyte streaming; `0406ec5` gate grammar off.

**On-device validation (2026-07-05, Qwen2.5-1.5B, drove the ai-worker binary directly):**
- **Grammar (P0-1) does NOT work in this build** — `LlamaSampler::grammar_lazy` aborts the whole worker process ("Rust cannot catch foreign exceptions") on ANY tool-call request, even a trivially-valid grammar. The C++ exception crosses the FFI boundary uncatchably. **Gated off** (`AI_WORKER_GRAMMAR=1` to opt in); builder + plumbing kept for a future fix. The model already emits valid `<tool_call>` JSON for common cases unaided; tool-name safety stays parser/bridge-side.
- **Multibyte (P1-3): PASS** — 你好世界/café/🎉 stream with no U+FFFD.
- **Context budget (P0-6): PASS** — 20k-token prompt returns TOO_LARGE, worker stays responsive (no SIGABRT).

**Remaining (deferred per §6):** grammar_lazy replacement (crate update or non-lazy loop) is the deferred "biggest reliability" lever; web AI via collab proxy; the MCP server (expose the editor to external agents); on-device visual verification of formatting-preserving Ask-AI (needs the desktop window + a 7B model). P0-B streaming UX, P0-9 ready handshake, P0-7 parser catalog validation, and the `<tool_call>` XML prompt split all shipped — see §6.

Below is the original plan, kept for context; **§6 is the live source of truth for what actually landed.** It superseded the ad-hoc AI fixes on `feat/desktop-native-ai-panel` (PR #236) and `fix/ai-detok-and-macos-build` (desktop PR #69). Grounded in two 2026-07-05 investigations:

- **Code audit** (multi-agent, 65 confirmed findings: 13 high / 25 med / 27 low) — scratchpad `audit-findings.json`.
- **UX/architecture research** (Gemini / Copilot / Notion / Tiptap / Liveblocks / llama.cpp) — scratchpad `research-brief.md`.

The two agree: the tool-calling contract is unconstrained end-to-end, there are two hand-mirrored inference stacks that drift, and the inline "Ask AI" edit path destroys formatting. This doc is the single remediation plan.

---

## 0. What the user actually reported

1. **"Ask AI" should live on the on-selection format chip**, not a separate surface — for *in-place, formatting-preserving* edits.
2. **Chat panel** for queries, but **intent-routed** so it can also manipulate the document.
3. **Ask-AI edits nuke all formatting** — headings, bold/italic, tables → replaced by a plain-paragraph blob.
4. **No loading / processing indicator** on Ask AI.
5. Rework **MCP + tools + prompts + flow**.

### The formatting-nuke bug — root cause (confirmed)

`packages/react/src/components/DocxEditor.tsx:6067` (desktop path) and `:6083-6112` (web path):
```js
// desktop
aiFragmentRef.current = markdownToFragment(text || selectionText, view.state.schema);
```
The model returns **plain text**; we parse it with `markdownToFragment` and, on Accept (`:6175`, `applyFragmentAsSuggestion`), `replaceWith` the original rich range. All OOXML run properties, heading levels, and table structure are discarded → the blob. This is exactly the anti-pattern the research flags: *never `replaceSelectionWith(plainParagraph)`*.

---

## 1. Target architecture

### 1.1 Surface model — selection is the router (Gemini/Copilot/Notion converge here)

| State | Surface | Behavior |
|---|---|---|
| Non-empty selection | **Format-chip "Ask AI"** | Verb chips (Rephrase, Shorten, Elaborate, Bulletize, Summarize, More formal, More casual) + custom prompt. Forced **mutate** — no intent classification. Selection = context window = replacement target. |
| Empty cursor / empty block | Inline "draft new" affordance | Generate at cursor. |
| Panel opened explicitly | **Chat panel** | Q&A + intent-routed mutate. `tool_choice=auto`: write-tool call ⇒ mutate, plain text ⇒ answer. |

**Invariants:**
- Chip and panel emit the **same accept/reject diff** — one apply codepath, not two.
- **One `LlmClient` interface** behind a single platform fork: `TauriLlmClient` (invoke `docops_llm_call` + `ai:stream-token`) vs `WebLlmClient` (collab proxy preferred, WebLLM fallback). Every surface — chip, panel, draft-new — routes through the same pipeline + shared prompt constants. Kills the dual-stack drift (audit cause #2; `transport.ts`, `nativeLlm.ts`, `DocxEditor.tsx:6049/10713`, `lib/writer/*`).
- **One desktop detector**: probe `window.__TAURI_INTERNALS__.invoke` from one module; delete the `__TAURI__` / `__deskApp__` splits (audit P0-11, high).

### 1.2 Formatting-preserving edits (the #1 fix) — regenerate + client-side LCS diff

Do **not** ask the local model for JSON patches/ops (Liveblocks/JSON-Whisperer both abandoned this — small models lose structure and emit malformed ops). Instead:

1. Serialize the selection as a **compact closed tag-markup** that maps 1:1 to our PM nodes/marks (`<Heading level>`, `<Bold>`, `<BulletList>`, …), with an explicit **"keep all node attributes"** instruction. Anything the vocabulary can't express (tables, textboxes, complex OOXML) → **opaque pass-through tokens** the model must not touch. This protects the OOXML invariant.
2. Model rewrites the region in that markup.
3. **Flatten both sides → LCS → rebuild** on our side: each token carries its original marks + tree position, so bold/lists/tables survive the diff (Liveblocks "extended-text diffing"). Use `prosemirror-changeset` for the diff UI but a **custom token encoder** (its default ignores marks/attrs — the very thing we must keep).
4. Apply the accepted result as a **range-scoped PM transaction** on `{from,to}` only (`preserveWhitespace:'full'`), keeping surviving runs. Replaces the current `markdownToFragment → replaceWith` path.

### 1.3 Tool-calling — grammar-constrained on local, native tool_use on API

**Desktop (Qwen/llama.cpp):** build a GBNF grammar from `DOCOPS_CATALOG` and attach `LlamaSampler::grammar` (exposed by `llama-cpp-2 0.1.150`, currently unused — `bin/ai_worker.rs:162` samples pure greedy). Minimum grammar: force `<tool_call>{"name":<enum-of-catalog-names>,"arguments":<object>}</tool_call>` — constraining `name` to the catalog enum makes hallucinated/`unknown` tools impossible. Research gotchas to guard:
- llama.cpp **fails open** on grammar-compile failure (returns unconstrained text) → **always validate client-side** (#19051).
- **Thinking mode breaks grammar** enforcement → disable on tool-emitting calls (#20345).
- **No regex** in the grammar (`pattern` → crash #19010); pre-flatten `$ref`s.
- Grammar is **not** injected into the prompt → mirror the schema + a **1-shot example** in the prompt (biggest small-model reliability lever).

**Web (Anthropic/collab):** native `tools` array only. **Remove the `<tool_call>` XML instructions** from the system prompt sent to Anthropic (`DocOpsPanel.tsx:63-90`) — currently we teach an XML protocol to a model given a native tools array (audit P0-2, high). Split `SYSTEM_PROMPT`: shared task core + native-tools variant + Qwen variant.

**Both:** require a catalog-member `name` before treating parsed JSON as a call; repair-reprompt once on parse failure; cap retries at 1–2.

### 1.4 Context management (desktop)

Token-budget the prompt in `build_qwen_prompt`: count tokens, reserve `max_tokens` headroom, truncate oldest tool_result blobs, return a structured `TOO_LARGE` **before** decoding (today it aborts mid-stream / SIGABRT — audit P0-6, high). Create the `LlamaContext` **once** at load and keep the KV cache warm (today: fresh 8192-ctx + full re-prefill every tool round, O(n²) — audit P1-2, high).

### 1.5 Streaming & loading UX (the "no sign anything's happening" fix)

Preview via **decorations, not mutations** (doc untouched until Accept):
- **Chip:** diff over the selection, render insertions/deletions as `Decoration.inline`/`widget`; stream Qwen tokens into the decoration with an AI-caret + shimmer. Reject = drop decorations (no undo entry).
- **Critical gotcha:** **suppress trailing removals while streaming** (`hideTrailingRemovals` during `receiving`) or the whole selection flashes red as the rewrite streams in.
- **Panel:** Liveblocks 3-stage — Receiving (stream) → Executing (confirm/cancel) → Executed (collapsed diff).
- Accept/reject: per-hunk + all; keys `Cmd/Ctrl-Y` accept / `Cmd/Ctrl-N` reject (detect Cmd vs Ctrl from `navigator.platform`); **don't commit to Y.Doc until Keep** (protects collab-undo + autosave).

### 1.6 Model floor & privacy

- Raise tool-calling floor to **Qwen2.5-1.5B/3B** (Q5_K_M/Q6_K); keep 0.5B for inline rewrite/summarize only. Pass the resolved active model id through the panel, not a hardcoded `claude-haiku-...`.
- **No silent local→cloud egress.** On worker crash, `docops_llm_call` currently forwards local-only document text to `api.anthropic.com` (audit P0-5, high; `lib.rs:1913,1925-1984`). Make remote fallback explicit/opt-in and add worker auto-restart.

---

## 2. Workstreams

### P0 — make it correct & reliable (bug bar)

| # | Problem | Files | Size |
|---|---------|-------|------|
| P0-A | **Formatting-nuke**: replace `markdownToFragment→replaceWith` with tag-markup + LCS-diff apply (§1.2) | `DocxEditor.tsx:6033-6220`, new diff module, `lib/writer/rewriteFragment.ts` | L |
| P0-B | **No loading state**: decoration-based streaming preview + AI-caret + suppress-trailing-removals (§1.5) | `DocxEditor.tsx` (Ask-AI), new decoration plugin | L |
| P0-1 | Grammar-constrained local sampling (`LlamaSampler::grammar` from catalog) | `bin/ai_worker.rs:162-200`, grammar builder in `ai_local.rs` | L |
| P0-2 | Split prompt; drop `<tool_call>` XML on the Anthropic path | `DocOpsPanel.tsx:63-90`, `ai_local.rs:706-736` | M |
| P0-3 | Strip dangling `tool_use` before persisting history (session-bricking 400) | `DocOpsPanel.tsx:479,491,529` | S |
| P0-4 | DirectTransport: CORS header (or collab proxy) + surface real Anthropic error + Retry | `transport.ts:83-103,168-175`, `DocOpsPanel.tsx` | M |
| P0-5 | No silent local→cloud egress; explicit opt-in + worker auto-restart | `lib.rs:1913,1925-1984`, `ai_local.rs:641,650` | M |
| P0-6 | Token-budget prompt; structured `TOO_LARGE` before decode | `ai_local.rs:699-824`, `bin/ai_worker.rs:143-159` | M |
| P0-7 | Reject non-catalog tool names; repair-reprompt | `ai_local.rs:828-900`, `bridge.ts:103-109` | M |
| P0-8 | Reject all pending promises on worker crash (stuck spinner) | `controller.ts:142-151` | S |
| P0-9 | Worker `ready` handshake; don't charge model-load to per-token timeout | `ai_local.rs:212-277,614,638`, `bin/ai_worker.rs:88-100` | M |
| P0-10 | Single `API_KEY_STORAGE` constant (inline AI dead on web) | `DocxEditor.tsx:2956-2957`, `DocOpsPanel.tsx:59` | S |
| P0-11 | Unify desktop detection to `__TAURI_INTERNALS__.invoke`; DesktopTransport rejects instead of silent swap | `transport.ts:341-357`, `DocOpsPanel.tsx:398` | S |

### P1 — responsiveness & correctness
Mutex held for whole inference (P1-1, L) · KV reuse (P1-2, L) · CJK/emoji `from_utf8_lossy` corruption (P1-3, M) · stop-marker/tool-JSON leaks to UI (P1-4) · one coalesced streaming bubble (P1-5) · transport timeouts (P1-6) · cancellable native inference (P1-7) · mutex-poison panic (P1-8) · dead-worker false success (P1-9) · empty-output error state (P1-10) · multi-tool-call handling (P1-11) · single enablement gate (P1-12) · classifier drops transformDoc/research/translate (P1-13). Full detail in `audit-findings.json`.

### P2 — hardening & consolidation
`LlmClient` consolidation (P2-1, L — the two-stack merge; do incrementally *after* P0/P1) · id-collision (P2-2) · zombie-worker reaping (P2-3) · serde tool_use (P2-4) · dedup rewrite prompts (P2-5) · flan-t5 prompt fix (P2-6) · memoize transport (P2-7) · false "No API key" banner (P2-8) · make-table converts in place (P2-9) · model floor/quants (P2-10) · getOutline off-by-one (P2-11) · WebLLM load-loop (P2-12/13).

---

## 3. Quick wins (<1 day, ship first)

1. P0-10 — key-constant fix un-breaks inline AI on web.
2. P0-3 — strip dangling `tool_use`; stops session-bricking 400.
3. P0-4a — `if(!resp.ok)` reads error body; real errors instead of "API error 400".
4. P1-8 — `unwrap_or_else(|e| e.into_inner())` removes a command-panic vector.
5. P0-8 — reject pending on worker crash; un-sticks inline spinner.
6. Remove `<tool_call>` XML from the Anthropic-path prompt (P0-2 first half).
7. P1-13 — revive translate/findIssues/transformDoc routing.

---

## 4. Verification
Rust: grammar fuzz (100 seeds → zero `unknown`/parse-fail), per-tool integration on a local 1.5B GGUF, multibyte decode test, `TOO_LARGE`-before-stream test, load-timeout test, `cargo test`+`clippy`. Web: Playwright with mocked Anthropic (assert no `<tool_call>` in system, native `tools` populated, real error+Retry surfaced), history-balance unit test, streaming-into-one-bubble smoke, **formatting-preservation test: select heading+bold+table, run Ask-AI, assert structure survives**. Standard local verify gate every push (`format:check`+lint+typecheck+unit+smoke) per repo rule.

---

## 5. Decisions (owner, 2026-07-05)
1. **Sequencing → bug-bar first.** Land P0 (formatting-preserving edits + streaming loading + grammar tool-calling + egress/history fixes), then the format-chip surface move + `LlmClient` consolidation.
2. **Cloud fallback → never leave device.** Drop the silent Anthropic fallback once a local model is loaded; local-only stays local; worker auto-restarts. (P0-5)
3. **Model floor → require ≥1.5B for the DocOps panel** (Q5_K_M/Q6_K); 0.5B for inline rewrite/summarize only. (P2-10)
4. **Web AI path → collab-server proxy** (key never reaches browser). Deferred behind the desktop-first bug-bar; when built it removes the need for the CORS header + plaintext-key storage. (P0-4)

---

## 6. Completion log (updated 2026-07-06)

The P0 bug-bar is shipped; the effort then continued into agentic/MCP/RAG and the
north-star objectives. This section is the source of truth for what landed;
`36-ai-north-star.md` holds the forward objectives (O1–O5).

### P0 bug-bar — shipped
- **P0-A formatting-nuke** ✅ `rewriteFragmentWith` (formatting-preserving LCS-style apply).
- **P0-B loading state** ✅ streaming/thinking indicators + Stop.
- **P0-2 drop `<tool_call>` XML on the API path** ✅ (agent executor uses native tool_use).
- **P0-3 strip dangling `tool_use`** ✅ (panel loop drops unmatched blocks).
- **P0-4 real errors + Retry** ✅ `friendlyLlmError` + MCP Retry/Connect. _(CORS/collab web-proxy — deferred, §5.4.)_
- **P0-5 no silent local→cloud egress** ✅ egress guard + worker auto-restart.
- **P0-6 token-budget / `TOO_LARGE` before decode** ✅ — and superseded by RAG (get_doc_stats no longer dumps the doc).
- **P0-7 reject non-catalog tools** ✅ (registry returns a structured error).
- **P0-8 reject pending on worker crash** ✅.
- **P0-9 worker `ready` handshake** ✅.
- **P0-10 single `API_KEY_STORAGE`** ✅. **P0-11 unified desktop detection** ✅ (+ DesktopTransport now single-round `drivesLoop=false`, which also made the agent reachable on the local model).
- **P1** — multibyte/CJK decode, dead-worker false-success, empty-output state, multi-tool-call handling, cancellable inference: ✅ shipped.

### Deferred (tracked, not done)
- **P0-1 grammar-constrained local decoding** — `grammar_lazy` aborts the worker in this llama build; gated behind `AI_WORKER_GRAMMAR`. Revisit on a llama-cpp bump.
- **Web AI via collab proxy** (CORS + key-never-in-browser) — §5.4.
- **MCP server** (expose the editor to external agents) — north-star O5, via collab.
- **On-device visual verification** — the O2 Folder-button dialog/chip + the O3 agent smoke test (need the live app + a 7B model).

### Beyond the bug-bar — agentic · MCP · RAG · north-star
- **Agentic** — plan→execute→reflect hardened: no false success (zero-tool = failed), native tools, `create_document` excluded from sub-tasks, structured reflection + dedup, planner grounding, repeated-call loop-guard.
- **MCP** — client + connect external servers, streaming-SSE transport, session headers, pagination, persistence + auth token, untrusted-output labeling.
- **RAG** — BM25 `search_document`/`search_sheet` (no more full-doc dump), + on-device workspace RAG (`search_workspace`, folder indexing, citations).
- **O1** — user-selectable 7B/8B local models + RAM-based recommendation (shared desktop catalog → serves both editors).
- **O2** — on-device workspace RAG, code-complete both editors (only visual verify pending).

### Docs ↔ Sheets parity (2026-07-06)

| Capability | Docs | Sheets | PRs |
|---|---|---|---|
| Formatting-preserving edits | ✅ | n/a | docs (rewriteFragmentWith) |
| Within-file RAG | ✅ `search_document` | ✅ `search_sheet` | docs #242 · sheets #267 |
| Workspace RAG + Folder button | ✅ | ✅ | docs #251/252/255/256 · sheets #274 · desktop #76/77/78 |
| Agentic (plan→execute→reflect) | ✅ | ✅ | docs #236/243/248/253 · sheets #263/272/273 |
| Agent reachable on local model | ✅ | ✅ (was already `drivesLoop=false`) | docs #246 |
| MCP (client, SSE, persist, auth, untrusted) | ✅ | ✅ | docs #240/244/247/249 · sheets #268/270/271 |
| Data-quality safety | n/a | ✅ numeric coercion / `get_workbook_info` | sheets #265/266 |
| 7B/8B local model + RAM-recommend (O1) | ✅ shared | ✅ shared | desktop #75 |

**Parity: achieved.** Both editors are at O1 + O2 code-complete with matched agentic/MCP/RAG surfaces. The only outstanding items are the deferred list above (grammar, web-proxy, MCP server) and on-device visual verification.

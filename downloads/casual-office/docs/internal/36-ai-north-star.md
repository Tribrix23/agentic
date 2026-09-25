# 36 — AI North Star & Goal

_Derived from the 2026-07-06 competitive analysis of Casual Docs/Sheets AI vs Google (Gemini), Microsoft (Copilot), Notion, Coda, Airtable, Rows, Sourcetable, SuperDoc._

## The one-line goal

**Be the only office suite where a genuinely capable AI runs entirely on your machine — private, offline, open, no AI tax — with editing fidelity that matches Word.**

## Why this goal (what the market proved)

Every commercial competitor is **cloud-only, proprietary, and paywalled** ($14–30/user/mo + AI credits). The one open-source peer (SuperDoc) ships **zero end-user AI UX**. So the market has a structural hole: **nobody offers private/offline/open AND a real end-user AI**. That hole is our wedge — the incumbents *cannot* follow us into it without abandoning their cloud/data-moat business model.

We do **not** try to beat them on frontier-model quality or 800-connector workspace RAG. We win on the axis they can't.

## Success criteria (how we know we got there)

A user can, **fully offline on their own laptop**:
1. Ask a question about a 50-page `.docx` and get a grounded, correct answer with the passages it used.
2. Give a 3-step instruction ("make the intro formal, add a conclusion, fix the heading levels") and watch the agent plan → execute → review it to completion — on the local model.
3. Do the same over a large spreadsheet (summarize, formula, edit) without data ever leaving the machine.
4. Never see an "upgrade to unlock AI" wall or a credit meter.

…and the document still round-trips to Word pristinely (already: 39/39).

## Objectives (prioritized — attack the ceiling, defend the wedge)

### O1 — Lift the local-model quality ceiling _(the #1 gap)_
Local is **Llama-3.2-1B**; rivals run GPT-5 / Claude Opus / Gemini 3. This is the single biggest limiter.
- User-selectable **larger local models** (7B–8B: Qwen2.5-7B, Llama-3.1-8B) via llama.cpp; auto-pick by available RAM; keep 1B as the floor.
- **KR:** a fixed suite of agentic tasks that fail on 1B succeed on 7B on real hardware.

### O2 — Close the grounding gap _within_ the privacy constraint
Rivals ground across Drive/Graph/800+ connectors with citations. We ground only the open doc.
- **On-device workspace RAG**: index the user's local folder of docs/sheets; retrieve across files; show citations. No cloud, no connectors.
- **KR:** "summarize across my last 5 documents" works offline with per-source attribution.

### O3 — Make "agentic on-device" a claim we can stand behind
The desktop agent path is wired but unverified live; competitors' agents are GA.
- Finish the **on-device smoke test** (panel → Rust → Qwen → runAgent); add repeated-call/loop guards; polish the live plan UI.
- **KR:** the 3-step success-criteria task runs to completion on the local model, demoed on real hardware.

### O4 — Own the "private + open + no-AI-tax" narrative
This is the wedge — make it legible and defended.
- Keep the never-leaves-device guarantee enforced (done); surface the mode matrix + "run local OR bring your own key" story in-app and on the site.
- **KR:** a first-time user understands "my documents never leave my machine" without reading docs.

### O5 — MCP both directions _(later)_
We ship the MCP **client** and a stdio MCP **server** in core (`packages/core/src/mcp/server.ts`); only exposing that server through the collab server (to external network agents) is deferred. Completes the "agent-native, open" story.

## Non-goals (explicitly)

- Frontier-model parity by default. (We're private-first; users can BYO a frontier key if they want it.)
- 800-connector cloud workspace RAG. (Ours stays on-device.)
- Enterprise SaaS / per-seat AI billing. (No AI tax is the point.)

## Scoreboard vs the field

| Axis | Us today | Target | Field |
|---|---|---|---|
| On-device / private | ✅ unique | keep + make legible | ❌ all cloud |
| Model quality | 🟡 1B local | 7B–8B local | ✅ frontier |
| Grounding | 🟡 open-doc | on-device workspace RAG | ✅ workspace+cites |
| Agentic (on-device) | 🟡 wired, unverified | verified, guarded | ✅ GA (cloud) |
| Open-source + real AI UX | ✅ unique | keep | ❌ (open OR AI, never both) |
| AI cost | ✅ free-local | keep | ❌ $14–30 + credits |

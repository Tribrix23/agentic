# 35 — Agentic AI + real MCP for DocOps

Status: **shipped, both editors** (updated 2026-07-19). Agentic plan→execute→reflect + real MCP **client** (incl. Streamable-HTTP transport + external-server wiring + cancel) landed and hardened across docs and sheets — completion log + docs↔sheet parity matrix in [34 §6](34-ai-production-rework.md#6-completion-log-updated-2026-07-06); forward objectives in [36 (north star)](36-ai-north-star.md). **Deferred:** the MCP **server** (expose the editor's tools to external agents) → north-star O5, via the collab server. Owner-directed: the DocOps AI must be genuinely **agentic** (autonomous plan → execute → reflect), not just an MCP-shaped tool surface. Builds on the tool catalog in `@casualoffice/docops` and the panel loop in `DocOpsPanel.tsx`.

## Starting point (what existed)

- **Tools:** `@casualoffice/docops` defines a 17-tool catalog (6 read / 11 write), called in-process via `bridge.callTool`. MCP-*shaped* (Anthropic tool defs) but **not the protocol** — nothing pluggable, no external agent access. (The real MCP server lived in the purged AGPL `packages/agents`.)
- **Agentic:** a flat ReAct loop in `DocOpsPanel` (≤12 rounds). No planning, decomposition, reflection, or visible plan.

## Architecture (built)

All in `@casualoffice/docops` — pure logic, transport- and UI-agnostic, unit-tested.

### 1. ToolRegistry — the pluggability seam (`agent/registry.ts`)
Unifies tools from any number of `ToolSource`s into one catalog and routes each call to the owning source. The built-in bridge is one source; an MCP client is another. First-registered-wins on name collisions (built-in shadows external), reported via `collisions`. The agent never knows a tool's origin.

### 2. Agent orchestrator — plan → execute → reflect (`agent/agent.ts`)
`runAgent(goal, { llm, registry }, options)`:
- **Plan** — one LLM call with a `submit_plan` meta-tool decomposes the goal into ordered sub-tasks (fallback: parse a prose list; degenerate: goal-as-one-task).
- **Execute** — each sub-task runs a ReAct tool loop over the registry (≤`maxRoundsPerTask`); mutations return `changedBlockIds` (tracked changes).
- **Reflect** — a `submit_reflection` meta-tool judges goal completion and may append corrective tasks (≤`maxReflections`).
- Emits `AgentEvent`s (`plan`/`task-start`/`task-tool`/`task-end`/`reflect`/`done`) for the panel UX; honors an `AbortSignal`.
- Injected `LlmFn` → runs against Anthropic API, collab server, or desktop native model unchanged.

### 3. Real MCP (`mcp/`)
- **`RpcConnection`** — minimal JSON-RPC 2.0 over an injected `JsonRpcTransport` (stdio / WebSocket / in-memory / Streamable-HTTP): id correlation, timeouts, notifications.
- **`httpTransport.ts`** — Streamable-HTTP transport (MCP spec `2025-06-18`): the browser-standard way `McpClient` reaches a remote MCP server. POSTs each JSON-RPC frame and handles both buffered `application/json` and long-lived `text/event-stream` (SSE) replies incrementally; optional same-origin `/api/mcp-proxy` for MCP servers that lack CORS headers.
- **`McpClient`** (`ToolSource`) — the client half: `initialize` → `tools/list` → `tools/call`, mapping MCP shapes to DocOps types. Lets the agent consume external MCP servers (web search, citations).
- **`McpServer`** — the protocol handler exposing an `McpToolProvider` (the DocOps catalog) to any MCP client (Claude Desktop, another agent, CLI).

Protocol version `2025-06-18`. Round-trip tested client↔server in-memory, including an MCP client registered alongside built-in tools in the agent registry.

## Wired (commit 2707731)

- **Agentic panel UX** (`DocOpsPanel`): `agentRuntime.ts` adapts `DocsBridge` → `ToolSource` and the panel transport → the agent's `LlmFn`, and builds the `ToolRegistry` (built-in + external MCP sources). The `send()` agent branch runs plan→execute→reflect for panel-driven transports; the live plan renders as a checklist with per-step status + tool steps + reflection notes. **Agent/Chat toggle** (opt-in, default Chat; hidden on collab). Playwright-verified: toggle renders, defaults Chat, flips to Agent.

## Shipped since (updated 2026-07-19)

- **External-MCP-server wiring — done.** `McpClient` now connects to user-configured external MCP servers registered into the panel's `ToolRegistry`. `DocOpsPanel` persists configured servers (URL + optional auth token) across reloads via `localStorage` (`McpServerState`), exposes a settings surface to add/remove them, and reaches CORS-less servers through the collab server's same-origin `/api/mcp-proxy` (see `mcp/httpTransport.ts`).
- **Cancel wiring — done.** A running agent is cancellable: `DocOpsPanel` holds an `AbortController` per run (`abortRef`) threaded into the agent's `AbortSignal`, driven by a **Stop** button; a stopped run reports "Stopped after N tool steps".

## Remaining

- **MCP host (server) wiring:** connect `McpServer` to a desktop stdio pipe (external agents drive the doc) and a collab WebSocket — deferred to north-star O5, via the collab server.
- Prompts/model tuning for the planner/reflection meta-tools on the local Qwen model (validate on-device — the agent makes several LLM round-trips, so latency/plan quality on a 1.5B model needs checking).
- Render `changedBlockIds` in the tracked-change/accept UI.

## Known unrelated red

Shard 1 of the docs e2e has 3 pre-existing SelectionAskAi-pill failures (pill anchored via `coordsAtPos` on the hidden off-screen ProseMirror — fails in headless). They fail identically at the branch base `0515980`, i.e. predate the agentic work; tracked separately.

## Tests
`packages/docops/src/agent/{registry,agent}.test.ts` (registry routing/collisions; plan-execute-reflect, corrective reflection, fallback, abort) + `mcp/mcp.test.ts` (client↔server round-trip, error mapping, registry integration) + `mcp/httpTransport.test.ts` (Streamable-HTTP: buffered JSON + SSE frames, proxy path). 21 tests across 4 files, all green.

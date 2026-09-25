/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

/**
 * Wiring that connects the transport-agnostic agent core in @casualoffice/docops
 * to the panel's concrete runtime: the DocsBridge becomes a ToolSource, and the
 * panel's DocOpsTransport becomes the injected LlmFn. External MCP clients can
 * be registered into the same registry so their tools join the agent's catalog.
 */

import {
  DOCOPS_CATALOG,
  HttpMcpTransport,
  McpClient,
  ToolRegistry,
  type LlmFn,
  type LlmResponse,
  type ToolSource,
} from '@casualoffice/docops';
import type { DocsBridge } from './bridge';
import type { DocOpsTransport } from './transport';

/** Adapt the in-process DocsBridge to a ToolSource. */
export function bridgeToolSource(bridge: DocsBridge): ToolSource {
  return {
    id: 'docops',
    listTools: () => DOCOPS_CATALOG,
    callTool: (name, args) => bridge.callTool(name, args),
  };
}

/**
 * Connect to an external MCP server over Streamable HTTP and return it as a
 * ToolSource (McpClient). `id` namespaces it in the registry (e.g. 'mcp:search').
 * Call `.listTools()` on the result to verify the server is reachable before
 * registering it.
 */
export function createMcpClient(
  url: string,
  id: string,
  headers?: Record<string, string>,
  proxyUrl?: string
): McpClient {
  return new McpClient(new HttpMcpTransport(url, { headers, proxyUrl }), { id });
}

/**
 * Build the agent's tool registry: the built-in DocOps tools first (so they win
 * name collisions), then any external MCP `ToolSource`s the user configured.
 */
export function createAgentRegistry(bridge: DocsBridge, extra: ToolSource[] = []): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(bridgeToolSource(bridge));
  for (const source of extra) registry.register(source);
  return registry;
}

/**
 * Adapt a single-round DocOpsTransport to the agent's LlmFn. Only valid for
 * transports that do NOT drive their own loop (Direct/Desktop) — the agent owns
 * the loop. Throws on a non-200 so the agent surfaces the real error.
 */
export function transportLlm(
  transport: DocOpsTransport,
  opts: { model: string; apiKey?: string; maxTokens?: number }
): LlmFn {
  return async ({ system, messages, tools, onText, signal }) => {
    const { data, status } = await transport.call({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      system,
      messages,
      tools: tools ?? [],
      apiKey: opts.apiKey || undefined,
      signal,
      onText,
    });
    if (status !== 200) {
      throw new Error(friendlyLlmError(status, data));
    }
    return data as LlmResponse;
  };
}

/**
 * Turn an HTTP status + Anthropic-shaped error body into an actionable message,
 * so users see "your key was rejected" instead of a bare "API error 401".
 * Prefers the provider's own message when present.
 */
export function friendlyLlmError(status: number, data: unknown): string {
  const raw = (data as { error?: { message?: string } })?.error?.message;
  if (status === 401 || status === 403)
    return raw || 'Your API key was rejected — check it in AI settings.';
  if (status === 429) return raw || 'Rate limited — wait a moment and try again.';
  if (status >= 500) return raw || `The AI service is unavailable (error ${status}).`;
  return raw || `AI request failed (error ${status}).`;
}

/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { McpClient } from './client';
import { McpServer, type McpToolProvider } from './server';
import type { JsonRpcTransport } from './jsonrpc';
import { ToolRegistry } from '../agent/registry';
import type { DocOpsResult, DocOpsTool } from '../types';

/** A pair of in-memory transports wired to each other (async delivery). */
function transportPair(): [JsonRpcTransport, JsonRpcTransport] {
  let aHandler: ((m: string) => void) | null = null;
  let bHandler: ((m: string) => void) | null = null;
  const a: JsonRpcTransport = {
    send: (m) => queueMicrotask(() => bHandler?.(m)),
    onMessage: (h) => {
      aHandler = h;
    },
  };
  const b: JsonRpcTransport = {
    send: (m) => queueMicrotask(() => aHandler?.(m)),
    onMessage: (h) => {
      bHandler = h;
    },
  };
  return [a, b];
}

const SEARCH_TOOL: DocOpsTool = {
  name: 'web_search',
  description: 'Search the web.',
  input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
};

function makeProvider(calls: Array<[string, unknown]>): McpToolProvider {
  return {
    listTools: () => [SEARCH_TOOL],
    callTool: async (name, args): Promise<DocOpsResult> => {
      calls.push([name, args]);
      if (name === 'web_search') return { ok: true, data: `results for ${args.q}` };
      return { ok: false, code: 'UNSUPPORTED', message: 'no such tool', retryable: false };
    },
  };
}

describe('MCP client ↔ server round-trip', () => {
  it('lists tools from the server via the client', async () => {
    const [clientT, serverT] = transportPair();
    new McpServer(serverT, makeProvider([]));
    const client = new McpClient(clientT, { id: 'mcp:search' });

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('web_search');
    expect(tools[0].input_schema.required).toEqual(['q']);
  });

  it('calls a server tool through the client', async () => {
    const calls: Array<[string, unknown]> = [];
    const [clientT, serverT] = transportPair();
    new McpServer(serverT, makeProvider(calls));
    const client = new McpClient(clientT, { id: 'mcp:search' });

    const res = await client.callTool('web_search', { q: 'hello' });
    expect(res.ok).toBe(true);
    expect(calls).toEqual([['web_search', { q: 'hello' }]]);
  });

  it('surfaces server tool errors as DocOps errors', async () => {
    const [clientT, serverT] = transportPair();
    new McpServer(serverT, makeProvider([]));
    const client = new McpClient(clientT, { id: 'mcp:x' });
    const res = await client.callTool('nope', {});
    expect(res.ok).toBe(false);
  });

  it('plugs into the agent registry alongside built-in tools', async () => {
    const [clientT, serverT] = transportPair();
    new McpServer(serverT, makeProvider([]));
    const client = new McpClient(clientT, { id: 'mcp:search' });

    const registry = new ToolRegistry();
    registry.register({
      id: 'docops',
      listTools: () => [
        { name: 'get_outline', description: 'x', input_schema: { type: 'object', properties: {} } },
      ],
      callTool: async () => ({ ok: true }),
    });
    registry.register(client);

    const tools = await registry.tools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_outline', 'web_search']);
    // The registry routes web_search to the MCP client.
    const res = await registry.call('web_search', { q: 'z' });
    expect(res.ok).toBe(true);
  });
});

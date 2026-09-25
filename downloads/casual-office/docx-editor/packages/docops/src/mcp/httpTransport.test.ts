/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { HttpMcpTransport } from './httpTransport';
import { McpClient } from './client';
import { McpServer, type McpToolProvider } from './server';
import type { JsonRpcTransport } from './jsonrpc';
import type { DocOpsResult, DocOpsTool } from '../types';

const TOOL: DocOpsTool = {
  name: 'web_search',
  description: 'Search the web.',
  input_schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
};

function provider(calls: Array<[string, unknown]>): McpToolProvider {
  return {
    listTools: () => [TOOL],
    callTool: async (name, args): Promise<DocOpsResult> => {
      calls.push([name, args]);
      return name === 'web_search'
        ? { ok: true, data: `hits for ${args.q}` }
        : { ok: false, code: 'UNSUPPORTED', message: 'no', retryable: false };
    },
  };
}

/** A fetch that routes the POST body through an McpServer and returns its reply. */
function mcpFetch(prov: McpToolProvider, sse = false): typeof fetch {
  let reply = '';
  let serverHandler: ((m: string) => void) | null = null;
  const t: JsonRpcTransport = {
    send: (m) => {
      reply = m;
    },
    onMessage: (h) => {
      serverHandler = h;
    },
  };
  // eslint-disable-next-line no-new
  new McpServer(t, prov);
  return (async (_url: string, init: { body?: string }) => {
    reply = '';
    serverHandler?.(String(init.body));
    await new Promise((r) => setTimeout(r, 5)); // let async callTool + send settle
    const body = sse && reply ? `event: message\ndata: ${reply}\n\n` : reply;
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

describe('HttpMcpTransport ↔ McpServer over HTTP', () => {
  it('lists and calls tools through a POST-based transport', async () => {
    const calls: Array<[string, unknown]> = [];
    const transport = new HttpMcpTransport('http://mcp.test/rpc', {
      fetchImpl: mcpFetch(provider(calls)),
    });
    const client = new McpClient(transport, { id: 'mcp:search' });

    const tools = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['web_search']);

    const res = await client.callTool('web_search', { q: 'agents' });
    expect(res.ok).toBe(true);
    expect(calls).toContainEqual(['web_search', { q: 'agents' }]);
  });

  it('parses a JSON-RPC reply delivered as an SSE data frame', async () => {
    const transport = new HttpMcpTransport('http://mcp.test/rpc', {
      fetchImpl: mcpFetch(provider([]), true),
    });
    const client = new McpClient(transport, { id: 'mcp:sse' });
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
  });

  it('routes through the proxy URL, wrapping the target url + body', async () => {
    let sawUrl = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sawEnvelope: any = null;
    const fetchImpl = (async (u: string, init: { body?: string }) => {
      sawUrl = u;
      sawEnvelope = JSON.parse(String(init.body));
      const inner = JSON.parse(sawEnvelope.body);
      const result =
        inner.method === 'initialize'
          ? { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: {} }
          : { tools: [] };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: inner.id, result }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport('https://mcp.example.com/rpc', {
      proxyUrl: 'https://collab.test/api/mcp-proxy',
      headers: { Authorization: 'Bearer t' },
      fetchImpl,
    });
    await new McpClient(transport, { id: 'mcp:proxied' }).listTools();

    // Requests hit the PROXY, carrying the real target url + the JSON-RPC body +
    // the auth header for the proxy to forward.
    expect(sawUrl).toBe('https://collab.test/api/mcp-proxy');
    expect(sawEnvelope.url).toBe('https://mcp.example.com/rpc');
    expect(typeof sawEnvelope.body).toBe('string');
    expect(sawEnvelope.headers.Authorization).toBe('Bearer t');
  });

  it('reads a streaming text/event-stream body incrementally (chunked)', async () => {
    const prov = provider([]);
    let reply = '';
    let serverHandler: ((m: string) => void) | null = null;
    const t: JsonRpcTransport = {
      send: (m) => {
        reply = m;
      },
      onMessage: (h) => {
        serverHandler = h;
      },
    };
    // eslint-disable-next-line no-new
    new McpServer(t, prov);
    const streamingFetch = (async (_url: string, init: { body?: string }) => {
      reply = '';
      serverHandler?.(String(init.body));
      await new Promise((r) => setTimeout(r, 5));
      const frame = `event: message\ndata: ${reply}\n\n`;
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Split mid-frame to prove incremental parsing, not buffering.
          controller.enqueue(enc.encode(frame.slice(0, 12)));
          controller.enqueue(enc.encode(frame.slice(12)));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }) as unknown as typeof fetch;

    const transport = new HttpMcpTransport('http://mcp.test/rpc', { fetchImpl: streamingFetch });
    const client = new McpClient(transport, { id: 'mcp:stream' });
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
  });
});

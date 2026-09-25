/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { describe, expect, it } from 'bun:test';
import { ToolRegistry, type ToolSource } from './registry';
import type { DocOpsResult, DocOpsTool } from '../types';

function tool(name: string): DocOpsTool {
  return { name, description: name, input_schema: { type: 'object', properties: {} } };
}

function source(id: string, names: string[], calls: string[] = []): ToolSource {
  return {
    id,
    listTools: () => names.map(tool),
    callTool: async (name): Promise<DocOpsResult> => {
      calls.push(`${id}:${name}`);
      return { ok: true, changedBlockIds: [`${name}-block`] };
    },
  };
}

describe('ToolRegistry', () => {
  it('merges tools from every source', async () => {
    const r = new ToolRegistry();
    r.register(source('docops', ['get_outline', 'rewrite_selection']));
    r.register(source('mcp:search', ['web_search']));
    const tools = await r.tools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_outline',
      'rewrite_selection',
      'web_search',
    ]);
  });

  it('routes a call to the owning source', async () => {
    const docopsCalls: string[] = [];
    const mcpCalls: string[] = [];
    const r = new ToolRegistry();
    r.register(source('docops', ['get_outline'], docopsCalls));
    r.register(source('mcp:search', ['web_search'], mcpCalls));
    await r.tools();
    const res = await r.call('web_search', { q: 'x' });
    expect(res.ok).toBe(true);
    expect(mcpCalls).toEqual(['mcp:search:web_search']);
    expect(docopsCalls).toEqual([]);
  });

  it('labels external MCP output as untrusted, leaves built-in output alone', async () => {
    const r = new ToolRegistry();
    r.register(source('docops', ['get_outline']));
    r.register(source('mcp:search', ['web_search']));
    await r.tools();

    const external = await r.call('web_search', { q: 'x' });
    expect(external.ok && external.untrusted).toBe(true);
    expect(external.ok && external.diffSummary).toContain('Untrusted');

    const builtin = await r.call('get_outline', {});
    expect(builtin.ok && builtin.untrusted).toBeUndefined();
  });

  it('reports first-registered-wins collisions', async () => {
    const r = new ToolRegistry();
    r.register(source('a', ['dup']));
    r.register(source('b', ['dup']));
    const tools = await r.tools();
    expect(tools.filter((t) => t.name === 'dup')).toHaveLength(1);
    expect(r.collisions).toContain('dup');
  });

  it('returns a structured error for an unknown tool', async () => {
    const r = new ToolRegistry();
    r.register(source('docops', ['get_outline']));
    const res = await r.call('does_not_exist', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('UNSUPPORTED');
  });

  it('rejects duplicate source ids', () => {
    const r = new ToolRegistry();
    r.register(source('docops', ['a']));
    expect(() => r.register(source('docops', ['b']))).toThrow();
  });
});

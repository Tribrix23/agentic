import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMcpCatalog } from '../mcp/catalog';
import { executeMcpTool, getMcpToolDefinitions } from '../mcp/renderer';
import type { McpServerSnapshot } from '../mcp/types';

function server(id: string, toolName = 'search'): McpServerSnapshot {
  return {
    id,
    name: id,
    status: 'ready',
    tools: [{ name: toolName, qualifiedName: `${id}:${toolName}`, permissions: ['read'] }],
    resources: [],
    resourceTemplates: [],
    prompts: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as any).window;
});

describe('MCP renderer catalog', () => {
  it('uses the same collision-safe alias for advertisement and dispatch', async () => {
    const servers = [server('alpha'), server('beta')];
    const catalog = buildMcpCatalog(servers);
    const definitions = getMcpToolDefinitions(servers);
    expect(new Set(definitions.map(item => item.function.name)).size).toBe(2);
    expect(definitions.map(item => item.function.name)).toEqual(catalog.map(item => item.externalName));

    const callTool = vi.fn().mockResolvedValue({ success: true, output: 'ok' });
    (globalThis as any).window = { electron: { mcp: { callTool, cancelCall: vi.fn() } } };
    const selected = catalog[1];
    const result = await executeMcpTool({
      id: 'call-1',
      name: selected.externalName,
      arguments: { query: 'x' },
      status: 'pending',
      timestamp: Date.now(),
    }, servers);

    expect(result?.success).toBe(true);
    expect(callTool).toHaveBeenCalledWith(
      selected.identity.serverId,
      selected.identity.toolName,
      { query: 'x' },
      { callId: 'call-1', timeoutMs: selected.definition.timeout },
    );
  });

  it('forwards cancellation to the main-process MCP call identity', async () => {
    let resolveCall!: (value: unknown) => void;
    const callTool = vi.fn(() => new Promise(resolve => { resolveCall = resolve; }));
    const cancelCall = vi.fn().mockResolvedValue(true);
    (globalThis as any).window = { electron: { mcp: { callTool, cancelCall } } };
    const servers = [server('alpha')];
    const entry = buildMcpCatalog(servers)[0];
    const controller = new AbortController();
    const pending = executeMcpTool({
      id: 'call-cancel',
      name: entry.externalName,
      arguments: {},
      status: 'pending',
      timestamp: Date.now(),
    }, servers, controller.signal);

    controller.abort();
    expect(cancelCall).toHaveBeenCalledWith('call-cancel');
    resolveCall({ success: false, output: 'cancelled' });
    await pending;
  });
});
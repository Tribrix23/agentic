import type { ToolDefinition } from '../tools/types';
import type { McpServerSnapshot, McpToolInfo } from './types';
import { mcpIdentityKey, stableMcpAlias, type McpToolIdentity } from './identity';

export interface McpCatalogEntry {
  identity: McpToolIdentity;
  identityKey: string;
  externalName: string;
  serverName: string;
  tool: McpToolInfo;
  definition: ToolDefinition;
}

export function buildMcpCatalog(servers: McpServerSnapshot[]): McpCatalogEntry[] {
  const occupied = new Set<string>();
  const entries: McpCatalogEntry[] = [];
  const ready = [...servers].filter(server => server.status === 'ready').sort((a, b) => a.id.localeCompare(b.id));
  for (const server of ready) {
    for (const tool of [...server.tools].sort((a, b) => a.name.localeCompare(b.name))) {
      if (server.id === 'agentic-mcp-server' && ['runCommand', 'commandStatus', 'manageTask'].includes(tool.name)) continue;
      
      // Decrease playwright tool list to only the necessary ones
      if (server.id === 'playwright') {
        const necessaryTools = ['playwright_navigate', 'playwright_click', 'playwright_fill', 'playwright_evaluate', 'playwright_screenshot'];
        // Also check if they are prefixed with 'browser_' or 'playwright_'
        const isNecessary = necessaryTools.includes(tool.name) || 
                            ['browser_navigate', 'browser_click', 'browser_fill', 'browser_evaluate', 'browser_snapshot', 'browser_screenshot', 'playwright_navigate', 'playwright_screenshot'].includes(tool.name);
        if (!isNecessary) continue;
      }
      
      const identity = { serverId: server.id, toolName: tool.name };
      const externalName = stableMcpAlias(identity, occupied);
      occupied.add(externalName);
      const mutating = tool.permissions.some(permission => permission === 'write' || permission === 'execute');
      const network = tool.permissions.includes('network');
      entries.push({
        identity,
        identityKey: mcpIdentityKey(identity),
        externalName,
        serverName: server.name,
        tool,
        definition: {
          name: externalName,
          description: `[MCP ${server.name}] ${tool.description || tool.name}`,
          category: 'system',
          parameters: tool.inputSchema || { type: 'object', properties: {} },
          requiresApproval: mutating,
          dangerLevel: mutating ? 'moderate' : 'safe',
          timeout: tool.timeoutMs || 60000,
          icon: 'Plug',
          capabilities: {
            sideEffect: mutating ? 'unknown' : 'none',
            concurrencyKeys: [`mcp:${server.id}`],
            cancellation: 'cooperative',
            permission: network ? 'network' : mutating ? 'system' : 'none',
          },
          metadata: { source: 'mcp', serverId: server.id, toolName: tool.name },
        },
      });
    }
  }
  return entries;
}

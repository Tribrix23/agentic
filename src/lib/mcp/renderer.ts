import type { McpServerSnapshot } from './types';
import { formatMcpToolCallResult } from './xml';
import type { ToolCall, ToolResult } from '../messageTypes';

export function toMcpAlias(serverId: string, toolName: string): string {
  return `mcp__${serverId.replace(/[^a-zA-Z0-9_]/g, '_')}__${toolName.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

export function getMcpToolDefinitions(servers: McpServerSnapshot[]): any[] {
  return servers.flatMap(server => server.status !== 'connected' ? [] : server.tools.map(tool => ({
    type: 'function',
    function: {
      name: toMcpAlias(server.id, tool.name),
      description: `[MCP ${server.name}] ${tool.description || tool.name}. XML identity: ${tool.qualifiedName}`,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
    mcp: { serverId: server.id, toolName: tool.name, qualifiedName: tool.qualifiedName },
  })));
}

export async function executeMcpTool(toolCall: ToolCall, servers: McpServerSnapshot[]): Promise<ToolResult | null> {
  const definition = getMcpToolDefinitions(servers).find(item => item.function.name === toolCall.name);
  if (!definition) return null;
  const { serverId, toolName } = definition.mcp;
  try {
    const result = await (window as any).electron.mcp.callTool(serverId, toolName, toolCall.arguments || {});
    return { ...result, output: formatMcpToolCallResult(serverId, toolName, result) };
  } catch (error: any) {
    const result = { success: false, output: error?.message || String(error) };
    return { ...result, output: formatMcpToolCallResult(serverId, toolName, result) };
  }
}

import type { McpServerSnapshot } from './types';
import type { ToolCall, ToolResult } from '../messageTypes';
import { mcpDisplayAlias } from './identity';
import { buildMcpCatalog, type McpCatalogEntry } from './catalog';

export function toMcpAlias(serverId: string, toolName: string): string {
  return mcpDisplayAlias({ serverId, toolName });
}

export function getMcpToolDefinitions(servers: McpServerSnapshot[]): any[] {
  return getMcpCatalogDefinitions(buildMcpCatalog(servers));
}

export async function executeMcpTool(toolCall: ToolCall, servers: McpServerSnapshot[], signal?: AbortSignal): Promise<ToolResult | null> {
  const entry = buildMcpCatalog(servers).find(item => item.externalName === toolCall.name);
  if (!entry) return null;
  const { serverId, toolName } = entry.identity;
  if (signal?.aborted) {
    return { success: false, output: 'MCP tool call cancelled.', diagnostics: [{ category: 'cancelled', message: 'MCP tool call cancelled.' }] };
  }
  const cancel = () => { void (window as any).electron.mcp.cancelCall(toolCall.id); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await (window as any).electron.mcp.callTool(serverId, toolName, toolCall.arguments || {}, {
      callId: toolCall.id,
      timeoutMs: entry.definition.timeout,
    });
  } catch (error: any) {
    return { success: false, output: error?.message || String(error), diagnostics: [{ category: 'transport', message: error?.message || String(error) }] };
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export function getMcpCatalogDefinitions(entries: McpCatalogEntry[]): any[] {
  return entries.map(entry => ({ type: 'function', function: { name: entry.externalName, description: entry.definition.description, parameters: entry.definition.parameters }, mcp: entry.identity }));
}

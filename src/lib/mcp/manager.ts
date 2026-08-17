import Ajv from 'ajv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  McpEvent, McpPermission, McpServerConfig, McpServerSnapshot, McpServerStatus, McpToolInfo,
} from './types';

type ServerRecord = McpServerSnapshot & { config: McpServerConfig; client?: Client; transport?: Transport };

const ajv = new Ajv({ allErrors: true, strict: false });
const DANGEROUS = /(^|_)(write|delete|remove|create|update|execute|run|send|publish|insert|drop|kill|admin)/i;

function classifyTool(name: string, description: string): McpPermission[] {
  const text = `${name} ${description}`;
  if (DANGEROUS.test(text)) return ['write'];
  return ['read'];
}

function textFromResult(result: any): string {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result.content)) {
    return result.content.map((item: any) => item?.text ?? (item?.resource ? JSON.stringify(item.resource) : JSON.stringify(item))).join('\n');
  }
  return JSON.stringify(result, null, 2);
}

export class McpClientManager {
  private servers = new Map<string, ServerRecord>();
  private listeners = new Set<(event: McpEvent) => void>();

  onEvent(listener: (event: McpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: McpEvent): void { this.listeners.forEach(listener => listener(event)); }

  addServer(config: McpServerConfig): McpServerSnapshot {
    if (!/^[a-zA-Z0-9_-]+$/.test(config.id)) throw new Error('MCP server ids may only contain letters, numbers, underscores, and hyphens.');
    if (this.servers.has(config.id)) throw new Error(`MCP server already exists: ${config.id}`);
    const record: ServerRecord = { id: config.id, name: config.name || config.id, status: 'disconnected', tools: [], resources: [], resourceTemplates: [], prompts: [], config };
    this.servers.set(config.id, record);
    return this.snapshot(record);
  }

  async removeServer(id: string): Promise<void> { if (this.servers.has(id)) await this.disconnectServer(id); this.servers.delete(id); }
  getServer(id: string): McpServerSnapshot | undefined { const record = this.servers.get(id); return record && this.snapshot(record); }
  getServers(): McpServerSnapshot[] { return Array.from(this.servers.values()).map(record => this.snapshot(record)); }
  getServerStatus(id: string): McpServerStatus | undefined { return this.servers.get(id)?.status; }

  async connectServer(id: string): Promise<McpServerSnapshot> {
    const record = this.require(id);
    if (record.status === 'connected') return this.snapshot(record);
    record.status = 'connecting'; record.error = undefined;
    this.emit({ type: 'server_connecting', serverId: id });
    try {
      const transport = record.config.transport.type === 'stdio'
        ? new StdioClientTransport({ command: record.config.transport.command, args: record.config.transport.args, cwd: record.config.transport.cwd, env: record.config.transport.env, stderr: 'pipe' })
        : new StreamableHTTPClientTransport(new URL(record.config.transport.url), { requestInit: { headers: record.config.transport.headers } });
      const client = new Client({ name: 'quantix-mcp-client', version: '1.0.0' });
      transport.onerror = error => this.fail(record, error);
      transport.onclose = () => { if (record.status === 'connected') { record.status = 'disconnected'; this.emit({ type: 'server_disconnected', serverId: id }); } };
      await client.connect(transport);
      record.client = client; record.transport = transport; record.status = 'connected';
      await this.discover(record);
      this.emit({ type: 'server_connected', serverId: id, data: this.snapshot(record) });
      return this.snapshot(record);
    } catch (error: any) { this.fail(record, error); throw error; }
  }

  async disconnectServer(id: string): Promise<void> {
    const record = this.require(id);
    try { await record.client?.close(); } catch (error) { this.fail(record, error); }
    record.client = undefined; record.transport = undefined; record.status = 'disconnected';
    this.emit({ type: 'server_disconnected', serverId: id });
  }

  async reconnectServer(id: string): Promise<McpServerSnapshot> { await this.disconnectServer(id); return this.connectServer(id); }

  async callTool(serverId: string, toolName: string, args: Record<string, any>, signal?: AbortSignal): Promise<{ success: boolean; output: string }> {
    const record = this.requireConnected(serverId);
    const tool = record.tools.find(item => item.name === toolName);
    if (!tool) return { success: false, output: `MCP tool not found: ${serverId}:${toolName}` };
    if (!this.isAllowed(record, tool)) return { success: false, output: `Permission denied for MCP tool: ${serverId}:${toolName}` };
    if (signal?.aborted) return { success: false, output: 'MCP tool call cancelled.' };
    this.emit({ type: 'tool_call_started', serverId, tool: toolName, data: { arguments: args } });
    try {
      const validate = ajv.compile(tool.inputSchema || { type: 'object' });
      if (!validate(args)) return { success: false, output: `Invalid arguments for ${serverId}:${toolName}: ${ajv.errorsText(validate.errors)}` };
      const result = await record.client!.callTool({ name: toolName, arguments: args });
      const output = textFromResult(result);
      this.emit({ type: 'tool_call_completed', serverId, tool: toolName, data: result });
      return { success: !Boolean((result as any).isError), output };
    } catch (error: any) { this.emit({ type: 'tool_call_failed', serverId, tool: toolName, error: error.message }); return { success: false, output: error.message || 'MCP tool call failed.' }; }
  }

  async listResources(serverId: string): Promise<any[]> { return this.requireConnected(serverId).resources; }
  async listResourceTemplates(serverId: string): Promise<any[]> { return this.requireConnected(serverId).resourceTemplates; }
  async readResource(serverId: string, uri: string): Promise<any> { const record = this.requireConnected(serverId); this.emit({ type: 'resource_read_started', serverId, resource: uri }); try { const result = await record.client!.readResource({ uri }); this.emit({ type: 'resource_read_completed', serverId, resource: uri, data: result }); return result; } catch (error: any) { this.fail(record, error); throw error; } }
  async listPrompts(serverId: string): Promise<any[]> { return this.requireConnected(serverId).prompts; }
  async getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<any> { return this.requireConnected(serverId).client!.getPrompt({ name, arguments: args }); }

  private async discover(record: ServerRecord): Promise<void> {
    const client: any = record.client;
    record.tools = ((await client.listTools()).tools || []).map((tool: any): McpToolInfo => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, permissions: classifyTool(tool.name, tool.description || ''), qualifiedName: `${record.id}:${tool.name}` }));
    record.resources = (await client.listResources()).resources || [];
    record.resourceTemplates = (await client.listResourceTemplates()).resourceTemplates || [];
    record.prompts = (await client.listPrompts()).prompts || [];
    record.tools.forEach(tool => this.emit({ type: 'tool_discovered', serverId: record.id, tool: tool.name, data: tool }));
  }
  private isAllowed(record: ServerRecord, tool: McpToolInfo): boolean { return tool.permissions.every(permission => (record.config.permissions || ['read']).includes(permission)); }
  private require(id: string): ServerRecord { const record = this.servers.get(id); if (!record) throw new Error(`MCP server not configured: ${id}`); return record; }
  private requireConnected(id: string): ServerRecord { const record = this.require(id); if (!record.client || record.status !== 'connected') throw new Error(`MCP server is not connected: ${id}`); return record; }
  private snapshot(record: ServerRecord): McpServerSnapshot { const { config, client, transport, ...snapshot } = record; return JSON.parse(JSON.stringify(snapshot)); }
  private fail(record: ServerRecord, error: any): void { record.status = 'error'; record.error = error?.message || String(error); this.emit({ type: 'server_error', serverId: record.id, error: record.error }); }
}

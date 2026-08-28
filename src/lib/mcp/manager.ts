import Ajv from 'ajv/dist/2020.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  McpEvent, McpPermission, McpServerConfig, McpServerSnapshot, McpServerStatus, McpToolInfo,
} from './types';

type ServerRecord = McpServerSnapshot & { config: McpServerConfig; client?: Client; transport?: Transport; reconnectAttempt: number; reconnectTimer?: ReturnType<typeof setTimeout>; disconnectRequested?: boolean; generation: number };

const ajv = new Ajv({ allErrors: true, strict: false });
const DANGEROUS = /(^|_)(write|delete|remove|create|update|execute|run|send|publish|insert|drop|kill|admin)/i;
const PLAYWRIGHT_MUTATION = /(^|_)(navigate|click|type|press|select|fill|drag|hover|upload|download|close|evaluate|run|resize|go_back|tabs?)(_|$)/i;
const MAX_TOOL_OUTPUT_CHARS = 100_000;

export function classifyMcpTool(serverId: string, name: string, description: string, annotations?: McpToolInfo['annotations']): McpPermission[] {
  const text = `${name} ${description}`;
  if (serverId === 'playwright') {
    const mutating = annotations?.readOnlyHint !== true || PLAYWRIGHT_MUTATION.test(text);
    return mutating ? ['network', 'write'] : ['network'];
  }
  if (annotations?.readOnlyHint === false || DANGEROUS.test(text)) return ['write'];
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

function boundedOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  return `${output.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n[Output truncated after ${MAX_TOOL_OUTPUT_CHARS} characters.]`;
}

export class McpClientManager {
  private servers = new Map<string, ServerRecord>();
  private listeners = new Set<(event: McpEvent) => void>();

  onEvent(listener: (event: McpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: McpEvent): void {
    this.listeners.forEach(listener => {
      try { listener(event); }
      catch (error) { console.error('[MCP] Event listener failed:', error); }
    });
  }

  addServer(config: McpServerConfig): McpServerSnapshot {
    if (!/^[a-zA-Z0-9_-]+$/.test(config.id)) throw new Error('MCP server ids may only contain letters, numbers, underscores, and hyphens.');
    if (this.servers.has(config.id)) throw new Error(`MCP server already exists: ${config.id}`);
    const record: ServerRecord = { id: config.id, name: config.name || config.id, status: 'configured', tools: [], resources: [], resourceTemplates: [], prompts: [], config, reconnectAttempt: 0, generation: 0 };
    this.servers.set(config.id, record);
    return this.snapshot(record);
  }

  async removeServer(id: string): Promise<void> { if (this.servers.has(id)) await this.disconnectServer(id); this.servers.delete(id); }
  getServer(id: string): McpServerSnapshot | undefined { const record = this.servers.get(id); return record && this.snapshot(record); }
  getServers(): McpServerSnapshot[] { return Array.from(this.servers.values()).map(record => this.snapshot(record)); }
  getServerStatus(id: string): McpServerStatus | undefined { return this.servers.get(id)?.status; }

  reportServerError(id: string, message: string): McpServerSnapshot {
    const record = this.require(id);
    this.fail(record, new Error(message));
    return this.snapshot(record);
  }

  async connectServer(id: string): Promise<McpServerSnapshot> {
    const record = this.require(id);
    if (record.status === 'ready') return this.snapshot(record);
    if (record.status === 'connecting') throw new Error(`MCP server is already connecting: ${id}`);
    const generation = ++record.generation;
    record.disconnectRequested = false;

    record.status = 'connecting'; record.error = undefined;
    this.emit({ type: 'server_connecting', serverId: id });
    try {
      const transport = record.config.transport.type === 'stdio'
        ? new StdioClientTransport({ command: record.config.transport.command, args: record.config.transport.args, cwd: record.config.transport.cwd, env: record.config.transport.env, stderr: 'pipe' })
        : new StreamableHTTPClientTransport(new URL(record.config.transport.url), { requestInit: { headers: record.config.transport.headers } });

      const client = new Client({ name: 'quantix-mcp-client', version: '1.0.0' });
      record.client = client;
      record.transport = transport;
      transport.onerror = (error: Error): void => {
        if (this.isCurrentConnection(record, generation, transport)) this.degrade(record, error);
      };
      transport.onclose = (): void => {
        if (this.isCurrentConnection(record, generation, transport)) this.handleClose(record, generation, transport);
      };

      await client.connect(transport);
      if (!this.isCurrent(record, generation) || record.disconnectRequested) {
        await client.close().catch((): undefined => undefined);
        throw new Error(`MCP connection superseded: ${id}`);
      }

      await this.discover(record);
      if (!this.isCurrent(record, generation) || record.disconnectRequested) {
        await client.close().catch((): undefined => undefined);
        throw new Error(`MCP discovery superseded: ${id}`);
      }
      record.status = 'ready'; record.reconnectAttempt = 0;
      this.emit({ type: 'server_connected', serverId: id, data: this.snapshot(record) });
      return this.snapshot(record);
    } catch (error: any) {
      if (this.isCurrent(record, generation)) {
        record.client = undefined;
        record.transport = undefined;
        this.fail(record, error);
        this.scheduleReconnect(record);
      }
      throw error;
    }
  }

  async disconnectServer(id: string): Promise<void> {
    const record = this.require(id);
    ++record.generation;
    record.disconnectRequested = true;
    if (record.reconnectTimer) clearTimeout(record.reconnectTimer);
    record.reconnectTimer = undefined;
    try { await record.client?.close(); } catch (error) { this.fail(record, error); }
    record.client = undefined; record.transport = undefined; record.status = 'disconnected';
    this.emit({ type: 'server_disconnected', serverId: id });
  }


  async closeAll(): Promise<void> {
    const records = Array.from(this.servers.values());
    records.forEach(record => {
      record.disconnectRequested = true;
      if (record.reconnectTimer) clearTimeout(record.reconnectTimer);
      record.reconnectTimer = undefined;
    });
    await Promise.allSettled(records.map(record => this.disconnectServer(record.id)));
  }

  async reconnectServer(id: string): Promise<McpServerSnapshot> { await this.disconnectServer(id); return this.connectServer(id); }

  async callTool(serverId: string, toolName: string, args: Record<string, any>, signal?: AbortSignal, timeoutMs = 60000): Promise<{ success: boolean; output: string; data?: unknown; diagnostics?: Array<{ category: string; message: string }> }> {
    let record: ServerRecord;
    try {
      record = this.requireConnected(serverId);
    } catch (error: any) {
      return { success: false, output: error?.message || String(error), diagnostics: [{ category: 'transport', message: error?.message || String(error) }] };
    }
    const generation = record.generation;
    const tool = record.tools.find(item => item.name === toolName);
    if (!tool) return { success: false, output: `MCP tool not found: ${serverId}:${toolName}` };
    if (!this.isAllowed(record, tool)) return { success: false, output: `Permission denied for MCP tool: ${serverId}:${toolName}` };
    if (signal?.aborted) return { success: false, output: 'MCP tool call cancelled.' };
    this.emit({ type: 'tool_call_started', serverId, tool: toolName, data: { arguments: args } });
    try {
      const validate = ajv.compile(tool.inputSchema || { type: 'object' });
      if (!validate(args)) return { success: false, output: `Invalid arguments for ${serverId}:${toolName}: ${ajv.errorsText(validate.errors)}` };
      const result = await record.client!.callTool({ name: toolName, arguments: args }, undefined, { signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs });
      if (!this.isCurrent(record, generation) || record.status !== 'ready') throw new Error(`MCP connection changed during tool call: ${serverId}:${toolName}`);
      if (!result || !Array.isArray((result as any).content)) throw new Error('MCP server returned a malformed tool result.');
      const output = boundedOutput(textFromResult(result));
      this.emit({ type: 'tool_call_completed', serverId, tool: toolName, data: result });
      return { success: !Boolean((result as any).isError), output, data: result };
    } catch (error: any) {
      const category = signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : /timeout/i.test(error?.message || '') ? 'timeout' : 'transport';
      this.emit({ type: 'tool_call_failed', serverId, tool: toolName, error: error.message });
      return { success: false, output: error.message || 'MCP tool call failed.', diagnostics: [{ category, message: error.message || String(error) }] };
    }
  }

  async listResources(serverId: string): Promise<any[]> { return this.requireConnected(serverId).resources; }
  async listResourceTemplates(serverId: string): Promise<any[]> { return this.requireConnected(serverId).resourceTemplates; }
  async readResource(serverId: string, uri: string): Promise<any> { const record = this.requireConnected(serverId); this.emit({ type: 'resource_read_started', serverId, resource: uri }); try { const result = await record.client!.readResource({ uri }); this.emit({ type: 'resource_read_completed', serverId, resource: uri, data: result }); return result; } catch (error: any) { this.fail(record, error); throw error; } }
  async listPrompts(serverId: string): Promise<any[]> { return this.requireConnected(serverId).prompts; }
  async getPrompt(serverId: string, name: string, args?: Record<string, string>): Promise<any> { return this.requireConnected(serverId).client!.getPrompt({ name, arguments: args }); }

  private async discover(record: ServerRecord): Promise<void> {
    const client: any = record.client;
    const capabilities = client.getServerCapabilities?.() || {};
    client.setNotificationHandler?.(ToolListChangedNotificationSchema, async () => {
      if (!record.client || record.disconnectRequested) return;
      await this.discoverTools(record);
    });
    await this.discoverTools(record);
    record.resources = capabilities.resources ? ((await client.listResources()).resources || []) : [];
    record.resourceTemplates = capabilities.resources ? ((await client.listResourceTemplates()).resourceTemplates || []) : [];
    record.prompts = capabilities.prompts ? ((await client.listPrompts()).prompts || []) : [];
  }

  private async discoverTools(record: ServerRecord): Promise<void> {
    const tools = ((await record.client!.listTools()).tools || []) as any[];
    record.tools = tools.map((tool): McpToolInfo => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      permissions: classifyMcpTool(record.id, tool.name, tool.description || '', tool.annotations),
      qualifiedName: `${record.id}:${tool.name}`,
    }));
    record.tools.forEach(tool => this.emit({ type: 'tool_discovered', serverId: record.id, tool: tool.name, data: tool }));
  }
  private isAllowed(record: ServerRecord, tool: McpToolInfo): boolean { return tool.permissions.every(permission => (record.config.permissions || ['read']).includes(permission)); }
  private require(id: string): ServerRecord { const record = this.servers.get(id); if (!record) throw new Error(`MCP server not configured: ${id}`); return record; }
  private requireConnected(id: string): ServerRecord { const record = this.require(id); if (!record.client || record.status !== 'ready') throw new Error(`MCP server is not ready: ${id} (${record.status})`); return record; }
  private snapshot(record: ServerRecord): McpServerSnapshot { const { config, client, transport, reconnectAttempt, reconnectTimer, disconnectRequested, generation, ...snapshot } = record; return JSON.parse(JSON.stringify(snapshot)); }
  private isCurrent(record: ServerRecord, generation: number): boolean { return this.servers.get(record.id) === record && record.generation === generation; }
  private isCurrentConnection(record: ServerRecord, generation: number, transport: Transport): boolean {
    return this.isCurrent(record, generation) && record.transport === transport;
  }
  private degrade(record: ServerRecord, error: any): void { if (record.status === 'ready') record.status = 'degraded'; record.error = error?.message || String(error); this.emit({ type: 'server_degraded', serverId: record.id, error: record.error }); }
  private fail(record: ServerRecord, error: any): void { record.status = 'failed'; record.error = error?.message || String(error); this.emit({ type: 'server_error', serverId: record.id, error: record.error }); }
  private handleClose(record: ServerRecord, generation: number, transport: Transport): void {
    if (!this.isCurrentConnection(record, generation, transport)) return;
    record.client = undefined; record.transport = undefined; record.status = 'disconnected';
    this.emit({ type: 'server_disconnected', serverId: record.id });
    if (!record.disconnectRequested) this.scheduleReconnect(record);
  }
  private scheduleReconnect(record: ServerRecord): void {
    const policy = record.config.reconnect;
    if (record.disconnectRequested || policy?.enabled === false) return;
    const maxAttempts = policy?.maxAttempts ?? 5;
    if (record.reconnectAttempt >= maxAttempts || record.reconnectTimer) return;
    const attempt = ++record.reconnectAttempt;
    const generation = record.generation;
    const delay = Math.min(policy?.maxDelayMs ?? 30000, (policy?.baseDelayMs ?? 1000) * 2 ** (attempt - 1));
    this.emit({ type: 'server_reconnecting', serverId: record.id, data: { attempt, delay } });
    record.reconnectTimer = setTimeout(() => {
      record.reconnectTimer = undefined;
      if (!this.isCurrent(record, generation) || record.disconnectRequested) return;
      this.connectServer(record.id).catch((): void => undefined);
    }, delay);
  }
}

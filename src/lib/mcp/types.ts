export type McpServerTransport =
  | { type: 'stdio'; command: string; args?: string[]; cwd?: string; env?: Record<string, string> }
  | { type: 'streamable-http'; url: string; headers?: Record<string, string> };

export type McpServerStatus = 'configured' | 'connecting' | 'ready' | 'degraded' | 'disconnected' | 'failed';
export type McpPermission = 'read' | 'write' | 'execute' | 'network';

export interface McpServerConfig {
  id: string;
  name?: string;
  transport: McpServerTransport;
  permissions?: McpPermission[];
  autoConnect?: boolean;
  reconnect?: { enabled?: boolean; maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };
}

export interface McpServerSnapshot {
  id: string;
  name: string;
  status: McpServerStatus;
  error?: string;
  tools: McpToolInfo[];
  resources: any[];
  resourceTemplates: any[];
  prompts: any[];
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  permissions: McpPermission[];
  qualifiedName: string;
  timeoutMs?: number;
}

export interface McpEvent {
  type:
    | 'server_connecting' | 'server_connected' | 'server_degraded' | 'server_reconnecting' | 'server_disconnected' | 'tool_discovered'
    | 'tool_call_started' | 'tool_call_completed' | 'tool_call_failed'
    | 'resource_read_started' | 'resource_read_completed' | 'server_error';
  serverId: string;
  tool?: string;
  resource?: string;
  error?: string;
  data?: any;
}

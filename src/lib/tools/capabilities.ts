export type ToolSideEffect = 'none' | 'workspace_read' | 'workspace_write' | 'process' | 'network' | 'unknown';

export type ToolPermission = 'none' | 'workspace_read' | 'workspace_write' | 'process' | 'network' | 'system';

export interface ToolTimeoutPolicy {
  defaultMs: number;
  maximumMs?: number;
}

export interface ToolOutputPolicy {
  inlineMaxBytes: number;
  previewBytes: number;
  artifactOnOverflow: boolean;
}

export interface ToolCapabilities {
  sideEffect: ToolSideEffect;
  concurrencyKeys: string[];
  timeout: ToolTimeoutPolicy;
  cancellation: 'cooperative' | 'best_effort' | 'unsupported';
  permission: ToolPermission;
  output: ToolOutputPolicy;
}

export const DEFAULT_TOOL_OUTPUT_POLICY: ToolOutputPolicy = {
  inlineMaxBytes: 60_000,
  previewBytes: 8_000,
  artifactOnOverflow: true,
};

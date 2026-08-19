import type { ToolCall } from '../messageTypes';
import type { RegisteredTool } from '../tools/types';

export type EffectClass = 'none' | 'workspace_read' | 'workspace_write' | 'process' | 'network' | 'unknown';

export interface ActionEffect {
  effect: EffectClass;
  resourceKeys: string[];
  explicitlyParallelizable: boolean;
}

export function describeToolEffect(call: ToolCall, registered?: RegisteredTool): ActionEffect {
  const capabilities = registered?.definition.capabilities;
  const effect = capabilities?.sideEffect || (call.name === 'readFile' ? 'workspace_read' : 'unknown');
  const args = call.arguments || {};
  const path = args.path || args.filePath || args.TargetFile || args.cwd;
  const resourceKeys = [
    ...(capabilities?.concurrencyKeys || []),
    ...(path ? [`path:${String(path).replace(/\\/g, '/').toLowerCase()}`] : []),
  ];
  return {
    effect,
    resourceKeys: Array.from(new Set(resourceKeys)),
    explicitlyParallelizable: Boolean(capabilities?.output && effect === 'none'),
  };
}
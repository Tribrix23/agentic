import type { ToolCall, ToolResult, Artifact } from '../messageTypes';
import type { ToolCapabilities } from './capabilities';

export type { ToolCall, ToolResult, Artifact };

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'filesystem' | 'terminal' | 'git' | 'search' | 'browser' | 'user' | 'system';
  parameters: Record<string, any>;
  requiresApproval: boolean;
  dangerLevel: 'safe' | 'moderate' | 'dangerous';
  timeout: number;
  icon: string;
  capabilities?: Partial<ToolCapabilities>;
  availability?: ToolAvailabilityProbe;
  metadata?: { source?: 'local' | 'mcp'; serverId?: string; toolName?: string };
}

export interface ToolContext {
  projectRoot: string;
  signal: AbortSignal;
  conversationId?: string;
  /** User turn that owns snapshots and undo records for this execution. */
  userMessageId?: string;
  /** Restrict this execution to the read-only Ask-mode policy. */
  readOnly?: boolean;
  parentLoop?: any; // AgentLoop instance for direct subagent management
  agentKind?: 'main' | 'subagent';
  agentRole?: string;
  runId?: string;
  turnId?: string;
  callId?: string;
  subagentManager?: import('../agent/subagentManager').SubagentManager;
}

export interface ToolAvailabilityContext {
  projectRoot?: string;
  electron?: Record<string, unknown>;
}

export type ToolAvailabilityProbe = (context: ToolAvailabilityContext) => boolean;

export type ToolHandler = (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export type ToolChoice = 'auto' | 'none' | { type: 'function'; function: { name: string } };

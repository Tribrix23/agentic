import type { ToolCall, ToolResult, Artifact } from '../messageTypes';

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
}

export interface ToolContext {
  projectRoot: string;
  signal: AbortSignal;
  conversationId?: string;
}

export type ToolHandler = (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export type ToolChoice = 'auto' | 'none' | { type: 'function'; function: { name: string } };

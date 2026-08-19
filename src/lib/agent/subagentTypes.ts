import type { Artifact, ToolCall } from '../messageTypes';

export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubagentRequest {
  parentRunId?: string;
  parentConversationId: string;
  taskId: string;
  task: string;
  role: string;
  projectRoot: string;
  targetFile?: string;
}

export interface SubagentHandle {
  childId: string;
  childRunId: string;
  status: SubagentStatus;
  createdAt: number;
}

export interface SubagentOutcome extends SubagentHandle {
  startedAt: number;
  completedAt: number;
  summary: string;
  finalAssistantContent: string;
  changedFiles: string[];
  toolCalls: ToolCall[];
  commands: string[];
  tests: string[];
  diagnostics: Array<{ category: string; message: string; details?: unknown }>;
  artifacts: Artifact[];
  unresolvedItems: string[];
}

export interface SubagentRunContext {
  childId: string;
  childRunId: string;
  signal: AbortSignal;
}

export type SubagentRunner = (request: SubagentRequest, context: SubagentRunContext) => Promise<Omit<SubagentOutcome, keyof SubagentHandle | 'startedAt' | 'completedAt'>>;
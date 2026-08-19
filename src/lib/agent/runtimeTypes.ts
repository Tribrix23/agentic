/** Stable identity and lifecycle contracts for one agent execution. */
export interface RunIdentity {
  runId: string;
  conversationId: string;
  turnId: string;
}

export type RunPhase =
  | 'created'
  | 'preparing'
  | 'streaming'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type RuntimeErrorKind =
  | 'cancelled'
  | 'timeout'
  | 'validation'
  | 'permission'
  | 'transport'
  | 'tool_failure'
  | 'internal';

export interface RuntimeError {
  kind: RuntimeErrorKind;
  message: string;
  code?: string;
  retryable?: boolean;
  cause?: unknown;
}

export interface TextBlock {
  kind: 'text';
  text: string;
  sourceStart?: number;
  sourceEnd?: number;
}

export interface ToolAction {
  kind: 'tool';
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  source: 'native' | 'text';
  sourceStart?: number;
  sourceEnd?: number;
}

export interface FinishAction {
  kind: 'finish';
  callId: string;
  claims: string[];
  evidence: string[];
}

export type AgentAction = ToolAction | FinishAction;
export type AssistantTurnBlock = TextBlock | ToolAction | FinishAction;

export interface AssistantTurn extends RunIdentity {
  kind: 'assistant_turn';
  blocks: AssistantTurnBlock[];
  text: string;
  actions: AgentAction[];
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ToolObservation extends RunIdentity {
  kind: 'tool_observation';
  callId: string;
  toolName: string;
  status: 'success' | 'failure' | 'cancelled' | 'timeout';
  summary: string;
  data?: unknown;
  artifactIds?: string[];
  truncated?: boolean;
  error?: RuntimeError;
}

export interface VerificationObservation extends RunIdentity {
  kind: 'verification_observation';
  passed: boolean;
  summary: string;
  evidence: string[];
  outstandingActions: string[];
}

export type AgentObservation = ToolObservation | VerificationObservation;

export interface AgentRunSnapshot extends RunIdentity {
  phase: RunPhase;
  iteration: number;
  startedAt: number;
  updatedAt: number;
  error?: RuntimeError;
}

export type RuntimeEvent =
  | { type: 'run:state'; run: AgentRunSnapshot }
  | { type: 'turn:assistant'; turn: AssistantTurn }
  | { type: 'tool:observation'; observation: ToolObservation }
  | { type: 'verification:observation'; observation: VerificationObservation }
  | { type: 'run:error'; identity: RunIdentity; error: RuntimeError };

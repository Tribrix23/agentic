import type { AgentRunSnapshot, RunPhase, RuntimeError } from './runtimeTypes';

const transitions: Record<RunPhase, readonly RunPhase[]> = {
  created: ['preparing', 'cancelled', 'failed'],
  preparing: ['streaming', 'cancelled', 'failed'],
  streaming: ['executing', 'verifying', 'cancelled', 'failed'],
  executing: ['streaming', 'verifying', 'cancelled', 'failed'],
  verifying: ['streaming', 'completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
};

export function canTransition(from: RunPhase, to: RunPhase): boolean {
  return transitions[from].includes(to);
}

export function transitionRun(
  snapshot: AgentRunSnapshot,
  phase: RunPhase,
  error?: RuntimeError,
  now = Date.now(),
): AgentRunSnapshot {
  if (!canTransition(snapshot.phase, phase)) {
    throw new Error(`Invalid agent run transition: ${snapshot.phase} -> ${phase}`);
  }
  return { ...snapshot, phase, updatedAt: now, ...(error ? { error } : {}) };
}

export function createRunSnapshot(
  runId: string,
  conversationId: string,
  turnId: string,
  now = Date.now(),
): AgentRunSnapshot {
  return { runId, conversationId, turnId, phase: 'created', iteration: 0, startedAt: now, updatedAt: now };
}

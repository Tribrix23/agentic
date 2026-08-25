import type { Artifact } from './messageTypes';
import type { AgentState } from './types/AgentTypes';

const TERMINAL_AGENT_STATES = new Set<AgentState>([
  'idle',
  'done',
  'quota_exhausted',
  'error',
]);

const WAITING_AGENT_STATES = new Set<AgentState>([
  'awaiting_plan_approval',
  'awaiting_tool_approval',
  'awaiting_user_response',
]);

/**
 * UI activity must include paused states: the run still owns resources and can
 * be cancelled while it waits for a question or permission decision.
 */
export function isAgentRunActive(isAgentRunning: boolean, agentState: AgentState): boolean {
  return isAgentRunning || !TERMINAL_AGENT_STATES.has(agentState);
}

export function isAgentWaiting(agentState?: string): boolean {
  return !!agentState && WAITING_AGENT_STATES.has(agentState as AgentState);
}

export function isAgentWorking(agentState?: string): boolean {
  return !!agentState && !TERMINAL_AGENT_STATES.has(agentState as AgentState) && !isAgentWaiting(agentState);
}

export function getAgentWaitingLabel(agentState?: string): string | undefined {
  switch (agentState) {
    case 'awaiting_tool_approval': return 'Waiting for permission...';
    case 'awaiting_user_response': return 'Waiting for your response...';
    case 'awaiting_plan_approval': return 'Waiting for plan approval...';
    default: return undefined;
  }
}

/** Only file-backed, user-facing artifacts are shown in the review surface. */
export function getReviewArtifacts(artifacts: Artifact[] | undefined): Artifact[] {
  return (artifacts || []).filter(artifact =>
    artifact.type === 'artifact_created' &&
    typeof artifact.path === 'string' &&
    artifact.path.trim().length > 0 &&
    artifact.metadata?.kind !== 'image'
  );
}

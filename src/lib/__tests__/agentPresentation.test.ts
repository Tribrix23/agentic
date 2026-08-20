import { describe, expect, it } from 'vitest';
import {
  getAgentWaitingLabel,
  getReviewArtifacts,
  isAgentRunActive,
  isAgentWaiting,
  isAgentWorking,
} from '../agentPresentation';

describe('agent presentation state', () => {
  it.each(['awaiting_tool_approval', 'awaiting_user_response'] as const)(
    'keeps the run active while %s',
    state => expect(isAgentRunActive(false, state)).toBe(true),
  );

  it.each([
    ['awaiting_tool_approval', 'Waiting for permission...'],
    ['awaiting_user_response', 'Waiting for your response...'],
  ] as const)('uses a waiting presentation for %s', (state, label) => {
    expect(isAgentWaiting(state)).toBe(true);
    expect(isAgentWorking(state)).toBe(false);
    expect(getAgentWaitingLabel(state)).toBe(label);
  });

  it('allows terminal states to show the send button', () => {
    expect(isAgentRunActive(false, 'done')).toBe(false);
    expect(isAgentRunActive(false, 'idle')).toBe(false);
  });

  it('returns only openable review artifacts', () => {
    const artifacts = getReviewArtifacts([
      { type: 'artifact_created', path: 'review.md', metadata: { summary: 'Review' } },
      { type: 'file_change', path: 'src/App.tsx' },
      { type: 'artifact_created' },
    ]);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('review.md');
  });
});
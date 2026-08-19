import { describe, expect, it } from 'vitest';
import { canTransition, createRunSnapshot, transitionRun } from '../agent/stateMachine';

describe('agent run state machine', () => {
  it('allows the normal startup path and preserves identity', () => {
  const initial = createRunSnapshot('run-1', 'conversation-1', 'turn-1', 10);
  const preparing = transitionRun(initial, 'preparing', undefined, 20);
  const streaming = transitionRun(preparing, 'streaming', undefined, 30);

    expect(streaming).toMatchObject({
      runId: 'run-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      phase: 'streaming',
      updatedAt: 30,
    });
  });

  it('keeps terminal states terminal', () => {
    expect(canTransition('completed', 'streaming')).toBe(false);
    expect(canTransition('cancelled', 'preparing')).toBe(false);
  });

  it('rejects completion before verification', () => {
    const initial = createRunSnapshot('run-1', 'conversation-1', 'turn-1');
    expect(() => transitionRun(initial, 'completed')).toThrow('created -> completed');
  });
});

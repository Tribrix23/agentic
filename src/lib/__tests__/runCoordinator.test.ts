import { describe, expect, it } from 'vitest';
import { RunCoordinator } from '../agent/runCoordinator';

describe('RunCoordinator', () => {
  it('fails an execution that does not reach a terminal phase', async () => {
    const coordinator = new RunCoordinator();
    await expect(coordinator.start({
      conversationId: 'conversation-1',
      execute: async () => 'result',
    })).rejects.toMatchObject({ code: 'RUN_NOT_TERMINAL' });
  });

  it('isolates listener failures from run execution', async () => {
    const coordinator = new RunCoordinator();
    coordinator.subscribe(() => { throw new Error('observer failed'); });
    await expect(coordinator.start({
      conversationId: 'conversation-2',
      execute: async context => {
        context.transition('streaming');
        return 'result';
      },
    })).resolves.toBe('result');
  });
});
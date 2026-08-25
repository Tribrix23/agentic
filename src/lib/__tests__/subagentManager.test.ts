import { describe, expect, it } from 'vitest';
import { SubagentManager } from '../agent/subagentManager';
import type { SubagentRunner } from '../agent/subagentTypes';

const request = { parentConversationId: 'parent', taskId: 'task-1', task: 'inspect', role: 'reviewer', projectRoot: 'C:/repo', readOnly: false, targetFile: 'src/a.ts' };
const success: Awaited<ReturnType<SubagentRunner>> = { summary: 'done', finalAssistantContent: 'done', changedFiles: [], toolCalls: [], commands: [], tests: [], diagnostics: [], artifacts: [], unresolvedItems: [] };

describe('SubagentManager', () => {
  it('overlaps disjoint target runs and returns structured outcomes', async () => {
    const order: string[] = [];
    const manager = new SubagentManager(async (_request, context) => {
      order.push(`start:${context.childId}`);
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push(`end:${context.childId}`);
      return success;
    });
    const first = manager.start(request);
    const second = manager.start({ ...request, taskId: 'task-2', targetFile: 'src/b.ts' });
    const [one, two] = await Promise.all([first.outcome, second.outcome]);
    expect(one.status).toBe('completed');
    expect(two.status).toBe('completed');
    expect(order.slice(0, 2)).toEqual([`start:${first.handle.childId}`, `start:${second.handle.childId}`]);
  });

  it('serializes identical targets and publishes terminal snapshots once', async () => {
    const order: string[] = [];
    const terminal: string[] = [];
    const manager = new SubagentManager(async (_request, context) => {
      order.push(`start:${context.childId}`);
      await new Promise(resolve => setTimeout(resolve, 5));
      order.push(`end:${context.childId}`);
      return success;
    });
    manager.subscribe(handles => handles.filter(handle => handle.status === 'completed').forEach(handle => {
      if (!terminal.includes(handle.childId)) terminal.push(handle.childId);
    }));
    const first = manager.start(request);
    const second = manager.start({ ...request, taskId: 'task-2' });
    await Promise.all([first.outcome, second.outcome]);
    expect(order).toEqual([`start:${first.handle.childId}`, `end:${first.handle.childId}`, `start:${second.handle.childId}`, `end:${second.handle.childId}`]);
    expect(terminal).toEqual([first.handle.childId, second.handle.childId]);
  });

  it('propagates parent cancellation into the child outcome', async () => {
    const parent = new AbortController();
    const manager = new SubagentManager(async (_request, context) => {
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
      });
      return success;
    });
    const child = manager.start(request, parent.signal);
    parent.abort();
    await expect(child.outcome).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('does not start a queued child after its parent has already aborted', async () => {
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>(resolve => { releaseFirst = resolve; });
    const started: string[] = [];
    const manager = new SubagentManager(async (_request, context) => {
      started.push(context.childId);
      if (started.length === 1) await firstStarted;
      return success;
    });
    const first = manager.start(request);
    const parent = new AbortController();
    const second = manager.start({ ...request, taskId: 'task-2' }, parent.signal);
    parent.abort();
    releaseFirst();
    await Promise.all([first.outcome, second.outcome]);
    expect(started).toEqual([first.handle.childId]);
    await expect(second.outcome).resolves.toMatchObject({ status: 'cancelled' });
  });
});

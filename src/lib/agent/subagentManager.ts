import type { SubagentHandle, SubagentOutcome, SubagentRequest, SubagentRunner } from './subagentTypes';

interface ChildRecord {
  handle: SubagentHandle;
  controller: AbortController;
  outcome: Promise<SubagentOutcome>;
}

export class SubagentManager {
  private readonly children = new Map<string, ChildRecord>();
  private writeTail: Promise<unknown> = Promise.resolve();

  constructor(private runner: SubagentRunner) {}

  setRunner(runner: SubagentRunner): void { this.runner = runner; }

  start(request: SubagentRequest, parentSignal?: AbortSignal): { handle: SubagentHandle; outcome: Promise<SubagentOutcome> } {
    const childId = `subagent:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    const handle: SubagentHandle = { childId, childRunId: `run:${childId}`, status: 'queued', createdAt: Date.now() };
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    if (parentSignal?.aborted) controller.abort(parentSignal.reason);
    else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const execute = async (): Promise<SubagentOutcome> => {
      const startedAt = Date.now();
      handle.status = 'running';
      try {
        if (controller.signal.aborted) throw abortError();
        const evidence = await this.runner(request, { childId, childRunId: handle.childRunId, signal: controller.signal });
        const status = controller.signal.aborted ? 'cancelled' : evidence.diagnostics.some(item => item.category === 'internal' || item.category === 'tool_failure') ? 'failed' : 'completed';
        handle.status = status;
        return { ...handle, ...evidence, status, startedAt, completedAt: Date.now() };
      } catch (error: any) {
        const cancelled = controller.signal.aborted || error?.name === 'AbortError';
        handle.status = cancelled ? 'cancelled' : 'failed';
        return {
          ...handle, startedAt, completedAt: Date.now(), summary: cancelled ? 'Subagent cancelled.' : 'Subagent failed.', finalAssistantContent: '', changedFiles: [], toolCalls: [], commands: [], tests: [], artifacts: [], unresolvedItems: [error?.message || String(error)],
          diagnostics: [{ category: cancelled ? 'cancelled' : 'internal', message: error?.message || String(error) }],
        };
      } finally {
        parentSignal?.removeEventListener('abort', onParentAbort);
      }
    };
    // Phase 9 conflict policy: child runs are serialized until isolated workspaces exist.
    const outcome = this.writeTail.then(execute, execute);
    this.writeTail = outcome.then((): void => undefined, (): void => undefined);
    this.children.set(childId, { handle, controller, outcome });
    // Do not use a bare `finally()` here: its returned rejecting promise would
    // become an unhandled rejection when the runner fails. Keep the handle
    // available briefly for `wait()`, then remove it without changing outcome.
    void outcome.then(
      () => setTimeout(() => this.children.delete(childId), 5 * 60 * 1000),
      () => setTimeout(() => this.children.delete(childId), 5 * 60 * 1000),
    );
    return { handle, outcome };
  }

  get(childId: string): SubagentHandle | undefined { return this.children.get(childId)?.handle; }
  wait(childId: string): Promise<SubagentOutcome> | undefined { return this.children.get(childId)?.outcome; }
  cancel(childId: string): boolean { const child = this.children.get(childId); if (!child) return false; child.controller.abort(); return true; }
  cancelAll(): void { for (const child of this.children.values()) child.controller.abort(); }
}

function abortError(): Error { const error = new Error('Subagent cancelled.'); error.name = 'AbortError'; return error; }
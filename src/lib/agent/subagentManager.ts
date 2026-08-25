import type { SubagentHandle, SubagentOutcome, SubagentRequest, SubagentRunner } from './subagentTypes';

interface ChildRecord {
  request: SubagentRequest;
  handle: SubagentHandle;
  controller: AbortController;
  outcome: Promise<SubagentOutcome>;
  begin: () => void;
}

export class SubagentManager {
  private readonly children = new Map<string, ChildRecord>();
  private readonly listeners = new Set<(snapshots: SubagentHandle[]) => void>();
  private readonly active = new Set<string>();
  private readonly queued: string[] = [];

  constructor(private runner: SubagentRunner) {}

  setRunner(runner: SubagentRunner): void { this.runner = runner; }

  start(request: SubagentRequest, parentSignal?: AbortSignal): { handle: SubagentHandle; outcome: Promise<SubagentOutcome> } {
    const childId = `subagent:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    const handle: SubagentHandle = { childId, childRunId: `run:${childId}`, status: 'queued', createdAt: Date.now(), taskId: request.taskId, parentConversationId: request.parentConversationId, role: request.role, targetFile: request.targetFile, readOnly: request.readOnly };
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    if (parentSignal?.aborted) controller.abort(parentSignal.reason);
    else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const execute = async (): Promise<SubagentOutcome> => {
      const startedAt = Date.now();
      Object.assign(handle, { status: 'running', startedAt });
      this.emit();
      try {
        if (controller.signal.aborted) throw abortError();
        const evidence = await this.runner(request, { childId, childRunId: handle.childRunId, signal: controller.signal });
        const failed = evidence.unresolvedItems.length > 0 || evidence.diagnostics.some(item => item.category !== 'cancelled');
        const status = controller.signal.aborted ? 'cancelled' : failed ? 'failed' : 'completed';
        Object.assign(handle, { status, completedAt: Date.now() });
        this.emit();
        return { ...handle, ...evidence, status, startedAt, completedAt: Date.now() };
      } catch (error: any) {
        const cancelled = controller.signal.aborted || error?.name === 'AbortError';
        Object.assign(handle, { status: cancelled ? 'cancelled' : 'failed', completedAt: Date.now() });
        this.emit();
        return {
          ...handle, startedAt, completedAt: Date.now(), summary: cancelled ? 'Subagent cancelled.' : 'Subagent failed.', finalAssistantContent: '', changedFiles: [], toolCalls: [], commands: [], tests: [], artifacts: [], unresolvedItems: [error?.message || String(error)],
          diagnostics: [{ category: cancelled ? 'cancelled' : 'internal', message: error?.message || String(error) }],
        };
      } finally {
        parentSignal?.removeEventListener('abort', onParentAbort);
        this.active.delete(childId);
        this.pump();
      }
    };
    let begin!: () => void;
    const gate = new Promise<void>(resolve => { begin = resolve; });
    const outcome = gate.then(execute);
    this.children.set(childId, { request, handle, controller, outcome, begin });
    this.queued.push(childId);
    this.emit();
    this.pump();
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

  snapshot(conversationId?: string): SubagentHandle[] {
    return Array.from(this.children.values())
      .map(child => ({ ...child.handle }))
      .filter(handle => !conversationId || handle.parentConversationId === conversationId);
  }

  subscribe(listener: (snapshots: SubagentHandle[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshots = this.snapshot();
    this.listeners.forEach(listener => listener(snapshots));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('subagent-snapshots', { detail: snapshots }));
  }

  private pump(): void {
    for (let index = 0; index < this.queued.length;) {
      const childId = this.queued[index];
      const child = this.children.get(childId);
      if (!child) { this.queued.splice(index, 1); continue; }
      if (this.conflicts(child.request)) { index++; continue; }
      this.queued.splice(index, 1);
      this.active.add(childId);
      child.begin();
    }
  }

  private conflicts(request: SubagentRequest): boolean {
    for (const childId of this.active) {
      const active = this.children.get(childId)?.request;
      if (!active) continue;
      if (request.readOnly && active.readOnly) continue;
      if (!request.readOnly && !active.readOnly && request.targetFile && active.targetFile && request.targetFile !== active.targetFile) continue;
      return true;
    }
    return false;
  }
}

function abortError(): Error { const error = new Error('Subagent cancelled.'); error.name = 'AbortError'; return error; }

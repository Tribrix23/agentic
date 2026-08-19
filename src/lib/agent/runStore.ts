import type { AgentRunSnapshot } from './runtimeTypes';

export interface StoredRun<TResult = unknown> {
  snapshot: AgentRunSnapshot;
  controller: AbortController;
  outcome: Promise<TResult>;
}

export class RunStore {
  private readonly activeByConversation = new Map<string, StoredRun>();
  private readonly snapshots = new Map<string, AgentRunSnapshot>();

  getActive<TResult = unknown>(conversationId: string): StoredRun<TResult> | undefined {
    return this.activeByConversation.get(conversationId) as StoredRun<TResult> | undefined;
  }

  setActive<TResult>(conversationId: string, run: StoredRun<TResult>): void {
    if (this.activeByConversation.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} already has an active run.`);
    }
    this.activeByConversation.set(conversationId, run as StoredRun);
    this.snapshots.set(run.snapshot.runId, run.snapshot);
  }

  update(snapshot: AgentRunSnapshot): void {
    this.snapshots.set(snapshot.runId, snapshot);
    const active = this.activeByConversation.get(snapshot.conversationId);
    if (active?.snapshot.runId === snapshot.runId) active.snapshot = snapshot;
  }

  clearActive(conversationId: string, runId: string): void {
    const active = this.activeByConversation.get(conversationId);
    if (active?.snapshot.runId === runId) this.activeByConversation.delete(conversationId);
  }

  isActive(identity: Pick<AgentRunSnapshot, 'conversationId' | 'runId'>): boolean {
    return this.activeByConversation.get(identity.conversationId)?.snapshot.runId === identity.runId;
  }

  getSnapshot(runId: string): AgentRunSnapshot | undefined {
    return this.snapshots.get(runId);
  }
}
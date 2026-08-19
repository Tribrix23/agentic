import type { RuntimeEventEnvelope, RuntimeEventListener } from './eventTypes';
import { AgentRuntimeError, toRuntimeError, throwIfAborted } from './runtimeErrors';
import { createRunIdentity } from './runIdentity';
import { RunStore } from './runStore';
import { createRunSnapshot, transitionRun } from './stateMachine';
import type { AgentRunSnapshot, RunPhase, RuntimeEvent } from './runtimeTypes';

export type RunConflictPolicy = 'reject' | 'cancel-and-replace' | 'queue';

export interface CoordinatedRunContext {
  readonly runId: string;
  readonly conversationId: string;
  readonly signal: AbortSignal;
  nextTurn(): string;
  getSnapshot(): AgentRunSnapshot;
  transition(phase: RunPhase): AgentRunSnapshot;
  emit(event: RuntimeEvent): boolean;
}

export interface StartRunOptions<TResult> {
  conversationId: string;
  policy?: RunConflictPolicy;
  execute(context: CoordinatedRunContext): Promise<TResult>;
}

export class RunCoordinator {
  private readonly listeners = new Set<RuntimeEventListener>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private eventSequence = 0;

  constructor(private readonly store = new RunStore()) {}

  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getActiveRun(conversationId: string): AgentRunSnapshot | undefined {
    return this.store.getActive(conversationId)?.snapshot;
  }

  cancel(conversationId: string, reason = 'Agent run was cancelled.'): boolean {
    const active = this.store.getActive(conversationId);
    if (!active) return false;
    active.controller.abort(new AgentRuntimeError('cancelled', reason));
    return true;
  }

  async start<TResult>(options: StartRunOptions<TResult>): Promise<TResult> {
    const policy = options.policy ?? 'reject';
    const active = this.store.getActive<TResult>(options.conversationId);
    if (active) {
      if (policy === 'reject') throw new AgentRuntimeError('validation', 'A run is already active for this conversation.', 'RUN_ACTIVE');
      if (policy === 'cancel-and-replace') {
        active.controller.abort(new AgentRuntimeError('cancelled', 'Superseded by a newer run.'));
        try { await active.outcome; } catch { /* terminal state is recorded by the owner */ }
      } else {
        const predecessor = this.queues.get(options.conversationId) ?? active.outcome.catch((): undefined => undefined);
        const queued = predecessor.then(() => this.start({ ...options, policy: 'reject' }));
        this.queues.set(options.conversationId, queued.catch((): undefined => undefined));
        return queued;
      }
    }

    return this.startNow(options);
  }

  private startNow<TResult>(options: StartRunOptions<TResult>): Promise<TResult> {
    const identityFactory = createRunIdentity(options.conversationId);
    const initialTurnId = identityFactory.nextTurn();
    const controller = new AbortController();
    let snapshot = createRunSnapshot(identityFactory.runId, options.conversationId, initialTurnId);
    let currentTurnId = initialTurnId;

    const emit = (event: RuntimeEvent): boolean => {
      if (!this.store.isActive(snapshot)) return false;
      this.eventSequence += 1;
      const envelope: RuntimeEventEnvelope = {
        eventId: `${snapshot.runId}:event:${this.eventSequence}`,
        sequence: this.eventSequence,
        timestamp: Date.now(),
        runId: snapshot.runId,
        conversationId: snapshot.conversationId,
        turnId: currentTurnId,
        event,
      };
      for (const listener of this.listeners) {
        try {
          listener(envelope);
        } catch (error) {
          // Observers are outside the run's ownership boundary. A faulty UI or
          // telemetry listener must not turn a successful run into a failure.
          console.error('[RunCoordinator] Runtime event listener failed:', error);
        }
      }
      return true;
    };

    const context: CoordinatedRunContext = {
      runId: snapshot.runId,
      conversationId: snapshot.conversationId,
      signal: controller.signal,
      nextTurn: () => {
        currentTurnId = identityFactory.nextTurn();
        snapshot = { ...snapshot, turnId: currentTurnId, iteration: snapshot.iteration + 1, updatedAt: Date.now() };
        this.store.update(snapshot);
        return currentTurnId;
      },
      getSnapshot: () => snapshot,
      transition: (phase: RunPhase): AgentRunSnapshot => {
        throwIfAborted(controller.signal);
        snapshot = transitionRun(snapshot, phase);
        this.store.update(snapshot);
        emit({ type: 'run:state', run: snapshot });
        return snapshot;
      },
      emit,
    };

    let resolveOutcome!: (value: TResult | PromiseLike<TResult>) => void;
    let rejectOutcome!: (reason?: unknown) => void;
    const outcome = new Promise<TResult>((resolve, reject) => { resolveOutcome = resolve; rejectOutcome = reject; });
    this.store.setActive(options.conversationId, { snapshot, controller, outcome });
    emit({ type: 'run:state', run: snapshot });

    void (async () => {
      try {
        context.transition('preparing');
        const result = await options.execute(context);
        throwIfAborted(controller.signal);
        if (snapshot.phase === 'streaming' || snapshot.phase === 'executing') context.transition('verifying');
        if (snapshot.phase === 'verifying') context.transition('completed');
        if (snapshot.phase !== 'completed') {
          throw new AgentRuntimeError('internal', `Run completed without reaching a terminal phase from ${snapshot.phase}.`, 'RUN_NOT_TERMINAL');
        }
        resolveOutcome(result);
      } catch (error) {
        const runtimeError = toRuntimeError(controller.signal.aborted ? controller.signal.reason ?? error : error);
        const terminal: RunPhase = runtimeError.kind === 'cancelled' ? 'cancelled' : 'failed';
        if (snapshot.phase !== 'completed' && snapshot.phase !== 'cancelled' && snapshot.phase !== 'failed') {
          snapshot = transitionRun(snapshot, terminal, runtimeError);
          this.store.update(snapshot);
          emit({ type: 'run:state', run: snapshot });
          emit({ type: 'run:error', identity: snapshot, error: runtimeError });
        }
        rejectOutcome(error);
      } finally {
        this.store.clearActive(options.conversationId, snapshot.runId);
      }
    })();

    return outcome;
  }
}
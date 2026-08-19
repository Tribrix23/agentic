import type { RuntimeError, RuntimeErrorKind } from './runtimeTypes';

export class AgentRuntimeError extends Error {
  constructor(
    public readonly kind: RuntimeErrorKind,
    message: string,
    public readonly code?: string,
    public readonly retryable = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentRuntimeError';
  }
}

export function toRuntimeError(error: unknown, fallback: RuntimeErrorKind = 'internal'): RuntimeError {
  if (error instanceof AgentRuntimeError) {
    return { kind: error.kind, message: error.message, code: error.code, retryable: error.retryable, cause: error.cause };
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { kind: 'cancelled', message: error.message || 'Agent run was cancelled.' };
  }
  return { kind: fallback, message: error instanceof Error ? error.message : String(error), cause: error };
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AgentRuntimeError('cancelled', 'Agent run was cancelled.');
}
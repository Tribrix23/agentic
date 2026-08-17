import {
  parseSequentialThought,
  requiresStructuredPlanning,
  SequentialThoughtTrace,
} from '../sequentialThinking';
import type { ToolCall } from '../messageTypes';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function thoughtCall(arguments_: Record<string, any>): ToolCall {
  return {
    id: 'thought-test',
    name: 'mcp__sequential_thinking__sequentialthinking',
    arguments: arguments_,
    status: 'completed',
    timestamp: Date.now(),
  };
}

export function runSequentialThinkingTests(): void {
  const first = thoughtCall({ thought: 'Inspect architecture', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true });
  assert(Boolean(parseSequentialThought(first)), 'A valid thought should parse');
  assert(parseSequentialThought(thoughtCall({ thought: '', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true })) === null, 'An empty thought should fail validation');

  const trace = new SequentialThoughtTrace();
  trace.record(first, { success: true, output: 'ok' });
  assert(!trace.isComplete(), 'The trace should remain open when another thought is needed');
  trace.record(thoughtCall({ thought: 'Finalize plan', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false }), { success: true, output: 'ok' });
  assert(trace.isComplete(), 'The trace should complete on a successful final thought');

  const invalidOrder = new SequentialThoughtTrace();
  assert(Boolean(invalidOrder.record(first, { success: true, output: 'ok' })), 'The first thought should be accepted');
  assert(invalidOrder.record(thoughtCall({ thought: 'Skipped number', thoughtNumber: 3, totalThoughts: 3, nextThoughtNeeded: false }), { success: true, output: 'ok' }) === null, 'Skipped thought numbers should be rejected');

  const invalidRevision = new SequentialThoughtTrace();
  assert(Boolean(invalidRevision.record(first, { success: true, output: 'ok' })), 'The first thought should be accepted for revision validation');
  assert(invalidRevision.record(thoughtCall({ thought: 'Invalid revision', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false, isRevision: true, revisesThought: 9 }), { success: true, output: 'ok' }) === null, 'Revisions must reference an existing thought');

  assert(requiresStructuredPlanning('Implement and integrate a multi-agent orchestration workflow'), 'Complex implementation should require planning');
  assert(!requiresStructuredPlanning('Rename this variable'), 'A narrow edit should not require structured planning');
}

if (typeof window === 'undefined') runSequentialThinkingTests();
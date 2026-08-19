let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export function createRunIdentity(conversationId: string): {
  runId: string;
  conversationId: string;
  nextTurn: () => string;
} {
  const runId = nextId('run');
  let turn = 0;
  return {
    runId,
    conversationId,
    nextTurn: () => {
      turn += 1;
      return `${runId}_turn_${turn}`;
    },
  };
}

export function createCallId(runId: string, turnId: string, index: number): string {
  return `${runId}:${turnId}:call:${index}`;
}

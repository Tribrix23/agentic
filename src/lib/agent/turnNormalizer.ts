import type { ProviderTurn } from './streamEvents';
import { parseTextToolProtocol } from './textToolProtocol';
import type { AssistantTurn, ToolAction } from './runtimeTypes';
import { selectToolProtocol, type ToolProtocol } from './toolProtocol';

function parseNativeArguments(name: string, source: string): Record<string, unknown> {
  if (!source.trim()) return {};
  try {
    const value = JSON.parse(source);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('arguments must be an object');
    return value;
  } catch (error) {
    throw new Error(`Invalid native arguments for ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function signature(action: ToolAction): string {
  return `${action.name}:${JSON.stringify(action.arguments)}`;
}

export function normalizeAssistantTurn(provider: ProviderTurn, knownToolNames?: Set<string>, mode: ToolProtocol = selectToolProtocol('')): AssistantTurn {
  const native = mode === 'xml' ? [] : provider.toolCalls.map<ToolAction>(call => ({
    kind: 'tool',
    callId: call.callId,
    name: call.name,
    arguments: parseNativeArguments(call.name, call.argumentsText),
    source: 'native',
  }));
  const textual = parseTextToolProtocol(provider.text, knownToolNames, mode === 'xml' ? 'xml' : 'permissive');
  const seen = new Set<string>();
  const actions = [...native, ...textual.actions].filter(action => {
    const key = signature(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const text = textual.text;
  return Object.freeze({
    kind: 'assistant_turn' as const,
    ...provider.identity,
    blocks: Object.freeze([...(text ? [{ kind: 'text' as const, text }] : []), ...actions]),
    text,
    actions: Object.freeze(actions),
    finishReason: provider.finishReason,
    usage: provider.usage,
  }) as AssistantTurn;
}

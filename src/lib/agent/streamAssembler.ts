import type { ProviderStreamEvent, ProviderToolCall, ProviderTurn } from './streamEvents';
import type { RunIdentity } from './runtimeTypes';

interface PendingToolCall extends ProviderToolCall { index: number }

export class ProviderStreamAssembler {
  private text = '';
  private reasoning = '';
  private finishReason?: string;
  private usage?: ProviderTurn['usage'];
  private readonly tools = new Map<number, PendingToolCall>();

  constructor(private readonly identity: RunIdentity) {}

  accept(event: ProviderStreamEvent): void {
    if (event.runId !== this.identity.runId || event.turnId !== this.identity.turnId || event.conversationId !== this.identity.conversationId) return;
    switch (event.type) {
      case 'text-delta': this.text += event.text; break;
      case 'reasoning-delta': this.reasoning += event.text; break;
      case 'tool-start': {
        const existing = this.tools.get(event.index);
        this.tools.set(event.index, {
          index: event.index,
          callId: event.callId || existing?.callId || `provider:${event.index}`,
          name: event.name || existing?.name || '',
          argumentsText: existing?.argumentsText || '',
        });
        break;
      }
      case 'tool-arguments-delta': {
        const existing = this.tools.get(event.index) ?? { index: event.index, callId: event.callId, name: '', argumentsText: '' };
        this.tools.set(event.index, { ...existing, callId: event.callId || existing.callId, argumentsText: existing.argumentsText + event.delta });
        break;
      }
      case 'tool-complete': {
        const existing = this.tools.get(event.index) ?? { index: event.index, callId: event.callId, name: '', argumentsText: '' };
        this.tools.set(event.index, {
          ...existing,
          callId: event.callId || existing.callId,
          name: event.name || existing.name,
          argumentsText: event.argumentsText ?? existing.argumentsText,
        });
        break;
      }
      case 'finish': this.finishReason = event.reason; this.usage = event.usage; break;
      case 'error': throw event.error;
    }
  }

  snapshot(): ProviderTurn {
    return {
      identity: { ...this.identity },
      text: this.text,
      reasoning: this.reasoning,
      toolCalls: [...this.tools.values()].sort((a, b) => a.index - b.index).map(({ callId, name, argumentsText }) => ({ callId, name, argumentsText })),
      finishReason: this.finishReason,
      usage: this.usage,
    };
  }
}
import type { RunIdentity } from './runtimeTypes';

export type ProviderStreamEvent =
  | ({ type: 'text-delta'; text: string } & RunIdentity)
  | ({ type: 'reasoning-delta'; text: string } & RunIdentity)
  | ({ type: 'tool-start'; index: number; callId: string; name?: string } & RunIdentity)
  | ({ type: 'tool-arguments-delta'; index: number; callId: string; delta: string } & RunIdentity)
  | ({ type: 'tool-complete'; index: number; callId: string; name?: string; argumentsText?: string } & RunIdentity)
  | ({ type: 'finish'; reason?: string; usage?: { inputTokens?: number; outputTokens?: number } } & RunIdentity)
  | ({ type: 'error'; error: Error } & RunIdentity);

export interface ProviderToolCall {
  callId: string;
  name: string;
  argumentsText: string;
}

export interface ProviderTurn {
  identity: RunIdentity;
  text: string;
  reasoning: string;
  toolCalls: ProviderToolCall[];
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}
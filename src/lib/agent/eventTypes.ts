import type { RunIdentity, RuntimeEvent } from './runtimeTypes';

export interface RuntimeEventEnvelope<TEvent extends RuntimeEvent = RuntimeEvent> extends RunIdentity {
  eventId: string;
  sequence: number;
  timestamp: number;
  event: TEvent;
}

export type RuntimeEventListener = (envelope: RuntimeEventEnvelope) => void;
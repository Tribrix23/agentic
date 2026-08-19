export type ActionJournalKind = 'started' | 'completed' | 'failed' | 'cancelled' | 'observation';

export interface ActionJournalEntry {
  sequence: number;
  runId?: string;
  turnId?: string;
  callId: string;
  kind: ActionJournalKind;
  timestamp: number;
  details?: unknown;
}

export class ActionJournal {
  private sequence = 0;
  private readonly entries: ActionJournalEntry[] = [];

  append(entry: Omit<ActionJournalEntry, 'sequence' | 'timestamp'> & { timestamp?: number }): ActionJournalEntry {
    const committed = { ...entry, sequence: ++this.sequence, timestamp: entry.timestamp || Date.now() };
    this.entries.push(committed);
    return committed;
  }

  snapshot(): ActionJournalEntry[] { return this.entries.slice(); }
  clear(): void { this.entries.length = 0; this.sequence = 0; }
}
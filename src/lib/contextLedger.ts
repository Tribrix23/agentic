export type ContextSection = 'system' | 'tools' | 'project' | 'history' | 'response';
export type ContextDecision = 'included' | 'truncated' | 'dropped' | 'deduplicated' | 'reserved';

export interface ContextLedgerEntry {
  id: string;
  section: ContextSection;
  decision: ContextDecision;
  requestedTokens: number;
  includedTokens: number;
  reason?: string;
}

export interface ContextLedgerSnapshot {
  limit: number;
  included: number;
  remaining: number;
  entries: ContextLedgerEntry[];
}

export class ContextLedger {
  private readonly entries: ContextLedgerEntry[] = [];

  constructor(private readonly limit: number) {}

  record(entry: ContextLedgerEntry): void {
    this.entries.push(entry);
  }

  snapshot(): ContextLedgerSnapshot {
    const included = this.entries.reduce((total, entry) => total + entry.includedTokens, 0);
    return {
      limit: this.limit,
      included,
      remaining: Math.max(0, this.limit - included),
      entries: [...this.entries],
    };
  }
}

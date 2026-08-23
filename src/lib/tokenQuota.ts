export type TokenQuotaTarget = 'token_remaining' | 'other_ai_remaining';

export interface TokenQuotaSnapshot {
  userId: string;
  max_token: number;
  token_remaining: number;
  reset: string | null;
  other_ai_remaining: number;
  other_ai_max: number;
  other_ai_reset: string | null;
}

const GET_TOKENS_ENDPOINT = 'https://api.devctr.com/api/get-tokens';
const DEDUCT_TOKENS_ENDPOINT = 'https://api.devctr.com/api/deduct-tokens';
// Quota units are intentionally smaller than provider token counts. This keeps
// the 250-unit weekly starter allowance useful for casual requests while still
// charging long agent runs and reasoning-heavy models meaningfully.
const INPUT_TOKEN_WEIGHT = 0.12;
const MINIMUM_START_CHARGE = 5;
const USAGE_CHECKPOINT = 625;
const QUOTA_RESET_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;

export interface QuotaResetDetails {
  resetAt: Date;
  days: number;
  hours: number;
}

export function getQuotaResetDetails(reset: string | null, now = Date.now()): QuotaResetDetails | null {
  if (!reset) return null;

  const firstTokenConsumedAt = new Date(reset);
  if (Number.isNaN(firstTokenConsumedAt.getTime())) return null;

  const resetAt = new Date(firstTokenConsumedAt.getTime() + QUOTA_RESET_WINDOW_MS);
  const remainingHours = Math.max(0, Math.ceil((resetAt.getTime() - now) / (60 * 60 * 1000)));

  return {
    resetAt,
    days: Math.floor(remainingHours / 24),
    hours: remainingHours % 24,
  };
}

export class QuotaExhaustedError extends Error {
  readonly code = 'QUOTA_EXHAUSTED';

  constructor(
    public readonly target: TokenQuotaTarget,
    public readonly required: number,
    public readonly remaining?: number,
  ) {
    super(`Weekly ${target === 'token_remaining' ? 'Dispatcher' : 'Other AI'} quota is exhausted.`);
    this.name = 'QuotaExhaustedError';
  }
}

export class QuotaBillingError extends Error {
  readonly code = 'QUOTA_BILLING_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'QuotaBillingError';
  }
}

export function isQuotaError(error: unknown): error is QuotaExhaustedError | QuotaBillingError {
  return error instanceof QuotaExhaustedError || error instanceof QuotaBillingError;
}

export function getQuotaTarget(model: string): TokenQuotaTarget {
  return model.toLowerCase().includes('dispatcher') ? 'token_remaining' : 'other_ai_remaining';
}

export function getModelUsageMultiplier(model: string): number {
  const normalized = model.toLowerCase();
  if (normalized.includes('dispatcher v1') && !normalized.includes('v1.2')) return 0.75;
  if (normalized.includes('dispatcher v1.2')) return 0.9;

  if (normalized.includes('gpt-oss') && normalized.includes('high')) return 1.5;
  if (normalized.includes('gpt-oss')) return 1;
  if (normalized.includes('lite') || normalized.includes('flash')) return 1;
  if (normalized.includes('pro') || normalized.includes('max') || normalized.includes('terra') || normalized.includes('sol')) return 2;
  return 1.25;
}

export async function fetchTokenQuota(userId: string): Promise<TokenQuotaSnapshot> {
  const response = await fetch(GET_TOKENS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new QuotaBillingError(data.message || 'Unable to verify the weekly token quota.');
  }
  return data as TokenQuotaSnapshot;
}

async function deductTokens(userId: string, amount: number, target: TokenQuotaTarget): Promise<void> {
  const response = await fetch(DEDUCT_TOKENS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount, target }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.message || 'Unable to deduct the token quota.';
    if (response.status === 402 || response.status === 403 || response.status === 409 || /insufficient|quota|remaining/i.test(message)) {
      throw new QuotaExhaustedError(target, amount);
    }
    throw new QuotaBillingError(message);
  }
}

function estimateTokens(text: string): number {
  return text.length / 4;
}

function chargeStepsForUsage(weightedTokens: number): number[] {
  const checkpoints = Math.floor(weightedTokens / USAGE_CHECKPOINT);
  return Array.from({ length: checkpoints }, (_, index) => {
    // Keep deductions granular enough to stop promptly, with a modest
    // surcharge for exceptionally long runs rather than a sudden cliff.
    return index < 10 ? 4 : index < 20 ? 8 : 12;
  });
}

export class TokenBillingSession {
  readonly target: TokenQuotaTarget;
  readonly multiplier: number;
  private weightedTokens = 0;
  private appliedStepCount = 0;
  private charged = 0;
  private remaining: number | undefined;
  private started = false;
  private promptConsumed = false;
  private stopped = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly userId: string,
    readonly model: string,
  ) {
    this.target = getQuotaTarget(model);
    this.multiplier = getModelUsageMultiplier(model);
  }

  async start(): Promise<void> {
    return this.enqueue(async () => {
      if (this.started) return;
      const quota = await fetchTokenQuota(this.userId);
      const remaining = quota[this.target];
      if (!Number.isFinite(remaining) || remaining < MINIMUM_START_CHARGE) {
        throw new QuotaExhaustedError(this.target, MINIMUM_START_CHARGE, remaining);
      }
      await deductTokens(this.userId, MINIMUM_START_CHARGE, this.target);
      this.started = true;
      this.charged = MINIMUM_START_CHARGE;
      // The start charge covers the first usage checkpoint. Without this,
      // consumePrompt can immediately issue a second identical deduction.
      this.appliedStepCount = 1;
      this.remaining = remaining - MINIMUM_START_CHARGE;
      this.publishUpdate();
    });
  }

  async consumePrompt(messages: Array<{ content?: string; tool_calls?: unknown }>): Promise<void> {
    // Agent iterations resend conversation history. Bill that input once for the
    // user submission instead of charging the same prompt on every iteration.
    if (this.promptConsumed) return;
    this.promptConsumed = true;
    const serialized = messages.map(message => `${message.content || ''}${message.tool_calls ? JSON.stringify(message.tool_calls) : ''}`).join('\n');
    await this.consume(estimateTokens(serialized) * INPUT_TOKEN_WEIGHT);
  }

  async consumeOutput(text: string): Promise<void> {
    await this.consume(estimateTokens(text));
  }

  stop(): void {
    this.stopped = true;
  }

  private async consume(rawTokens: number): Promise<void> {
    if (!this.started) throw new QuotaBillingError('Token billing session was not started.');
    if (this.stopped || rawTokens <= 0) return;
    this.weightedTokens += rawTokens * this.multiplier;
    await this.enqueue(async () => {
      if (this.stopped) return;
      const steps = chargeStepsForUsage(this.weightedTokens);
      while (this.appliedStepCount < steps.length) {
        const amount = steps[this.appliedStepCount];
        if (this.remaining !== undefined && this.remaining < amount) {
          this.stopped = true;
          const error = new QuotaExhaustedError(this.target, amount, this.remaining);
          this.publishExhausted(error);
          throw error;
        }
        try {
          await deductTokens(this.userId, amount, this.target);
        } catch (error) {
          this.stopped = true;
          if (error instanceof QuotaExhaustedError) this.publishExhausted(error);
          throw error;
        }
        this.appliedStepCount++;
        this.charged += amount;
        if (this.remaining !== undefined) this.remaining -= amount;
        this.publishUpdate();
      }
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const result = this.queue.then(work);
    this.queue = result.catch((): undefined => undefined);
    return result;
  }

  private publishUpdate(): void {
    window.dispatchEvent(new CustomEvent('token-quota-updated', {
      detail: { target: this.target, charged: this.charged, remaining: this.remaining },
    }));
  }

  private publishExhausted(error: QuotaExhaustedError): void {
    window.dispatchEvent(new CustomEvent('token-quota-exhausted', {
      detail: { target: this.target, message: error.message },
    }));
  }
}

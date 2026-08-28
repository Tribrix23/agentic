export const ERROR_CODES = ["INVALID_ARGUMENT", "NOT_FOUND", "AMBIGUOUS_TARGET", "STALE_TARGET", "NOT_VISIBLE", "OBSTRUCTED", "TIMEOUT", "NAVIGATION_BLOCKED", "NAVIGATION_FAILED", "REDIRECT_BLOCKED", "BROWSER_DISCONNECTED", "SESSION_CLOSED", "DOWNLOAD_BLOCKED", "EVALUATION_DISABLED", "OUTPUT_LIMIT", "PERMISSION_DENIED", "INTERNAL_ERROR"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ToolFailure extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly retryable = false, public readonly action = "retry", public readonly details?: Record<string, unknown>) { super(message); this.name = "ToolFailure"; }
}

export function normalizeError(error: unknown): ToolFailure {
  if (error instanceof ToolFailure) return error;
  if (error instanceof Error) return new ToolFailure("INTERNAL_ERROR", error.message, false, "inspect diagnostics");
  return new ToolFailure("INTERNAL_ERROR", "The operation failed", false, "inspect diagnostics");
}

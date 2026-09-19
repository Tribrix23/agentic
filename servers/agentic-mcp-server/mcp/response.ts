import type { Limits } from "../support/limits.js";
import { boundText } from "../support/limits.js";

export interface Diagnostic { code: string; retryable: boolean; action: string; details?: Record<string, unknown>; }
export interface ArtifactRef { artifactId: string; mimeType: string; size: number; expiresAt?: string; }
export interface ToolResponse<T> {
  ok: boolean; data?: T;
  observation?: { source: "browser" | "page" | "document"; untrusted: true; truncated?: boolean; redactions?: string[] };
  diagnostics: Diagnostic[];
  artifacts?: ArtifactRef[];
}

export function success<T>(data: T, options: Partial<Omit<ToolResponse<T>, "ok" | "data" | "diagnostics">> = {}): ToolResponse<T> {
  return { ok: true, data, diagnostics: [], ...options };
}

export function failure(code: string, action: string, retryable = false, details?: Record<string, unknown>): ToolResponse<never> {
  return { ok: false, diagnostics: [{ code, action, retryable, details }] };
}

export function boundResponse<T>(response: ToolResponse<T>, limits: Limits): ToolResponse<T> {
  const json = JSON.stringify(response.data ?? null);
  const bounded = boundText(json, limits.maxChars);
  if (!bounded.truncated) return response;
  return { ...response, data: { summary: bounded.value } as T, observation: { source: "page", untrusted: true, truncated: true } };
}

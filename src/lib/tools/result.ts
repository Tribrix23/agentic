import type { ToolResult } from '../messageTypes';
import type { StoredArtifact } from './artifactStore';

export interface ToolDiagnostic {
  category: 'cancelled' | 'timeout' | 'validation' | 'permission' | 'transport' | 'tool_failure' | 'internal';
  message: string;
  details?: unknown;
}

export interface ToolTruncation {
  truncated: boolean;
  originalBytes: number;
  includedBytes: number;
  continuation?: string;
}

export interface NormalizedToolResult extends ToolResult {
  summary: string;
  diagnostics?: ToolDiagnostic[];
  artifactRef?: StoredArtifact;
  truncation?: ToolTruncation;
}

export function normalizeToolResult(result: ToolResult): NormalizedToolResult {
  const output = typeof result.output === 'string' ? result.output : String(result.output ?? '');
  const summary = output.split(/\r?\n/, 1)[0] || (result.success ? 'Tool completed.' : 'Tool failed.');
  const diagnostics: ToolDiagnostic[] | undefined = result.diagnostics?.map(diagnostic => ({
    category: normalizeDiagnosticCategory(diagnostic.category),
    message: diagnostic.message,
    details: diagnostic.details,
  }));
  return {
    ...result,
    output,
    summary,
    diagnostics,
    truncated: Boolean(result.truncated),
  };
}

function normalizeDiagnosticCategory(category: string): ToolDiagnostic['category'] {
  const known: ToolDiagnostic['category'][] = ['cancelled', 'timeout', 'validation', 'permission', 'transport', 'tool_failure', 'internal'];
  return known.includes(category as ToolDiagnostic['category']) ? category as ToolDiagnostic['category'] : 'internal';
}

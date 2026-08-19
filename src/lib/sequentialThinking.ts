import type { ToolCall, ToolResult } from './messageTypes';

export interface SequentialThought {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
}

export interface SequentialThoughtSummary {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision: boolean;
  revisesThought?: number;
  branchId?: string;
}

export const SEQUENTIAL_THINKING_SERVER_ID = 'sequential-thinking';
export const SEQUENTIAL_THINKING_TOOL_NAME = 'sequentialthinking';
export const SEQUENTIAL_THINKING_ALIAS = 'mcp__sequential_thinking__sequentialthinking';

const PLANNING_DISCOVERY_TOOLS = new Set([
  'listDirectory', 'readFile', 'grepSearch', 'findByName', 'searchFiles',
  'codeAnalysis', 'webSearch', 'readUrl', 'gitStatus', 'gitDiff', 'commandStatus',
]);

export function isSequentialThinkingTool(toolName: string): boolean {
  return toolName === SEQUENTIAL_THINKING_ALIAS || toolName === SEQUENTIAL_THINKING_TOOL_NAME;
}

export function hasSequentialThinkingTool(definitions: any[]): boolean {
  return definitions.some(definition => isSequentialThinkingTool(definition?.function?.name ?? definition?.name));
}

export function isToolBlockedBeforeStructuredPlan(toolName: string): boolean {
  return !isSequentialThinkingTool(toolName) && !PLANNING_DISCOVERY_TOOLS.has(toolName);
}

export function normalizeSequentialThinkingArguments(rawArgs: Record<string, any> = {}): Record<string, any> {
  const normalizeBoolean = (value: any): any => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return value;
  };

  return {
    ...rawArgs,
    nextThoughtNeeded: normalizeBoolean(rawArgs.nextThoughtNeeded),
    isRevision: normalizeBoolean(rawArgs.isRevision),
    needsMoreThoughts: normalizeBoolean(rawArgs.needsMoreThoughts),
  };
}

export function parseSequentialThought(toolCall: ToolCall): SequentialThought | null {
  if (!isSequentialThinkingTool(toolCall.name)) return null;

  // Some XML-capable models serialize JSON booleans as strings (and sometimes
  // use Python-style casing). Normalize only the known scalar fields here so
  // the MCP transport remains JSON-correct while the agent can recover.
  const args: Record<string, any> = normalizeSequentialThinkingArguments(toolCall.arguments || {});
  const thought = typeof args.thought === 'string' ? args.thought.trim() : '';
  const thoughtNumber = Number(args.thoughtNumber);
  const totalThoughts = Number(args.totalThoughts);

  if (!thought || !Number.isInteger(thoughtNumber) || thoughtNumber < 1) return null;
  if (!Number.isInteger(totalThoughts) || totalThoughts < 1) return null;
  if (typeof args.nextThoughtNeeded !== 'boolean') return null;

  const parsed: SequentialThought = {
    thought,
    thoughtNumber,
    totalThoughts: Math.max(totalThoughts, thoughtNumber),
    nextThoughtNeeded: args.nextThoughtNeeded,
  };

  if (typeof args.isRevision === 'boolean') parsed.isRevision = args.isRevision;
  if (Number.isInteger(Number(args.revisesThought))) parsed.revisesThought = Number(args.revisesThought);
  if (Number.isInteger(Number(args.branchFromThought))) parsed.branchFromThought = Number(args.branchFromThought);
  if (typeof args.branchId === 'string' && args.branchId.trim()) parsed.branchId = args.branchId.trim();
  if (typeof args.needsMoreThoughts === 'boolean') parsed.needsMoreThoughts = args.needsMoreThoughts;

  if (parsed.isRevision && !parsed.revisesThought) return null;
  if (parsed.branchFromThought && !parsed.branchId) return null;
  return parsed;
}

export class SequentialThoughtTrace {
  private thoughts: SequentialThought[] = [];

  record(toolCall: ToolCall, result: ToolResult): SequentialThoughtSummary | null {
    if (!result.success) return null;
    const thought = parseSequentialThought(toolCall);
    if (!thought) return null;

    const latest = this.thoughts[this.thoughts.length - 1];
    const knownThoughtNumbers = new Set(this.thoughts.map(item => item.thoughtNumber));

    // The MCP tool can describe revisions and branches, but the trace itself
    // must still advance monotonically so the planning gate cannot be bypassed
    // by replaying an earlier thought number.
    if (latest && thought.thoughtNumber !== latest.thoughtNumber + 1) return null;
    if (thought.isRevision && !knownThoughtNumbers.has(thought.revisesThought!)) return null;
    if (thought.branchFromThought && !knownThoughtNumbers.has(thought.branchFromThought)) return null;

    this.thoughts.push(thought);
    return this.toSummary(thought);
  }

  get length(): number {
    return this.thoughts.length;
  }

  isComplete(): boolean {
    const latest = this.thoughts[this.thoughts.length - 1];
    return Boolean(latest && !latest.nextThoughtNeeded && !latest.needsMoreThoughts);
  }

  getLatestSummary(): SequentialThoughtSummary | null {
    const latest = this.thoughts[this.thoughts.length - 1];
    return latest ? this.toSummary(latest) : null;
  }

  private toSummary(thought: SequentialThought): SequentialThoughtSummary {
    return {
      thoughtNumber: thought.thoughtNumber,
      totalThoughts: thought.totalThoughts,
      nextThoughtNeeded: thought.nextThoughtNeeded,
      isRevision: Boolean(thought.isRevision),
      revisesThought: thought.revisesThought,
      branchId: thought.branchId,
    };
  }
}

export function requiresStructuredPlanning(goal: string): boolean {
  const normalized = goal.trim();
  if (!normalized) return false;

  const wordCount = normalized.split(/\s+/).length;
  const complexIntent = /\b(architect|architecture|implement|integrate|migrate|refactor|redesign|multi[- ]?agent|planner|orchestrat|workflow|across|multiple files)\b/i.test(normalized);
  const multiStepLanguage = /\b(and then|after that|first|second|finally|end[- ]to[- ]end|step by step)\b/i.test(normalized);
  return wordCount >= 35 || complexIntent || multiStepLanguage;
}

export function buildSequentialPlanningContract(alias: string = SEQUENTIAL_THINKING_ALIAS): string {
  return `\n# Structured Planning Gate
This request requires structured planning. You may inspect the project with read-only tools first. Before calling createTodoListTasks, invokeSubagent, or any file-writing/execution tool, you MUST complete a Sequential Thinking trace using ${alias}.
- Start with thoughtNumber 1 and a realistic bounded totalThoughts (normally 3-6).
- Call the tool once per thought. If nextThoughtNeeded is true, your next planning action must be another Sequential Thinking call.
- nextThoughtNeeded, isRevision, and needsMoreThoughts are booleans: emit lowercase true or false without quotes (never "True").
- Use revisions or branches when evidence invalidates an earlier assumption.
- On the final thought set nextThoughtNeeded to false and summarize the executable plan in that thought.
- After the trace completes, create the durable task graph with createTodoListTasks and execute only dependency-ready tasks.
Do not expose raw private reasoning in conversational text; provide concise decisions and progress only.`;
}
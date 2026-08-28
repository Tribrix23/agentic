import { RegisteredTool, ToolDefinition, ToolHandler } from './types';
import { DEFAULT_TOOL_OUTPUT_POLICY, type ToolCapabilities } from './capabilities';

const tools = new Map<string, RegisteredTool>();
const disabledTools = new Set<string>();

export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  // Idempotency guard: prevent double-registration of the same tool
  if (tools.has(definition.name)) {
    console.warn(`[Registry] Tool "${definition.name}" is already registered. Skipping duplicate registration.`);
    return;
  }
  const capabilities: ToolCapabilities = {
    sideEffect: definition.capabilities?.sideEffect || inferSideEffect(definition),
    concurrencyKeys: definition.capabilities?.concurrencyKeys || inferConcurrencyKeys(definition),
    timeout: definition.capabilities?.timeout || { defaultMs: definition.timeout },
    cancellation: definition.capabilities?.cancellation || 'best_effort',
    permission: definition.capabilities?.permission || inferPermission(definition),
    output: { ...DEFAULT_TOOL_OUTPUT_POLICY, ...definition.capabilities?.output },
  };
  tools.set(definition.name, { definition: { ...definition, capabilities }, handler });
}

export function getTool(name: string): RegisteredTool | undefined {
  return tools.get(name);
}

export function getAllTools(): RegisteredTool[] {
  return Array.from(tools.values());
}

export function getToolsByCategory(category: string): RegisteredTool[] {
  return getAllTools().filter(t => t.definition.category === category);
}

export function getToolsForLLM(context = currentAvailabilityContext()): any[] {
  return getAllTools()
    .filter(t => !disabledTools.has(t.definition.name) && isToolAvailable(t.definition, context))
    .map(t => ({
      type: 'function',
      function: {
        name: t.definition.name,
        description: t.definition.description,
        parameters: t.definition.parameters,
      },
    }));
}

// Tools that subagents should NOT have access to
const SUBAGENT_FORBIDDEN_TOOLS = new Set([
  'askUser',           // Subagents should not ask user questions explicitly
  'sendMessage',       // Subagents should not send messages
  'manageTask',        // Subagents should not manage background tasks
  'commandStatus',     // Subagents should not check command status
  'invokeSubagent',    // Subagents should not spawn more subagents
  'createTodoListTasks', // Subagents should not create todo lists
  'updateTaskStatus',  // Subagents should not update task status
  'codeAnalysis',      // Subagents should not do code analysis
  'listDirectory',     // Subagents rely on main agent for context
]);

export function getToolsForSubagent(context = currentAvailabilityContext()): any[] {
  return getAllTools()
    .filter(t => !disabledTools.has(t.definition.name)
      && isToolAvailable(t.definition, context)
      && !SUBAGENT_FORBIDDEN_TOOLS.has(t.definition.name))
    .map(t => ({
      type: 'function',
      function: {
        name: t.definition.name,
        description: t.definition.description,
        parameters: t.definition.parameters,
      },
    }));
}

export function enableTool(name: string): void {
  disabledTools.delete(name);
}

export function disableTool(name: string): void {
  disabledTools.add(name);
}

export function isToolEnabled(name: string): boolean {
  return !disabledTools.has(name);
}

export function isToolAvailable(definition: ToolDefinition, context = currentAvailabilityContext()): boolean {
  try {
    return definition.availability ? definition.availability(context) : true;
  } catch {
    return false;
  }
}

function currentAvailabilityContext(): { electron?: Record<string, unknown> } {
  const electron = typeof window === 'undefined' ? undefined : (window as any).electron;
  return { electron };
}

function inferSideEffect(definition: ToolDefinition): ToolCapabilities['sideEffect'] {
  if (definition.category === 'filesystem') return definition.requiresApproval ? 'workspace_write' : 'workspace_read';
  if (definition.category === 'terminal' || definition.category === 'git') return 'process';
  if (definition.category === 'browser') return 'network';
  return definition.requiresApproval ? 'unknown' : 'none';
}

function inferPermission(definition: ToolDefinition): ToolCapabilities['permission'] {
  if (definition.category === 'filesystem') return definition.requiresApproval ? 'workspace_write' : 'workspace_read';
  if (definition.category === 'terminal' || definition.category === 'git') return 'process';
  if (definition.category === 'browser') return 'network';
  return definition.requiresApproval ? 'system' : 'none';
}

function inferConcurrencyKeys(definition: ToolDefinition): string[] {
  if (definition.category === 'filesystem') return definition.requiresApproval ? ['workspace-write'] : ['workspace-read'];
  if (definition.category === 'git') return ['git'];
  if (definition.category === 'terminal') return ['process'];
  return [];
}

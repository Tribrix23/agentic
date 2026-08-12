import { RegisteredTool, ToolDefinition, ToolHandler } from './types';

const tools = new Map<string, RegisteredTool>();
const disabledTools = new Set<string>();

export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  // Idempotency guard: prevent double-registration of the same tool
  if (tools.has(definition.name)) {
    console.warn(`[Registry] Tool "${definition.name}" is already registered. Skipping duplicate registration.`);
    return;
  }
  tools.set(definition.name, { definition, handler });
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

export function getToolsForLLM(): any[] {
  return getAllTools()
    .filter(t => !disabledTools.has(t.definition.name))
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
  'askUser',           // Subagents should not ask user questions
  'sendMessage',       // Subagents should not send messages
  'manageTask',        // Subagents should not manage background tasks
  'commandStatus',     // Subagents should not check command status
  'invokeSubagent',    // Subagents should not spawn more subagents
  'createTodoListTasks', // Subagents should not create todo lists
  'updateTaskStatus',  // Subagents should not update task status
  'webSearch',         // Subagents should not do web searches
  'readUrl',           // Subagents should not read URLs
  'codeAnalysis',      // Subagents should not do code analysis
  'listDirectory',     // Subagents rely on main agent for context
]);

export function getToolsForSubagent(): any[] {
  return getAllTools()
    .filter(t => !disabledTools.has(t.definition.name) && !SUBAGENT_FORBIDDEN_TOOLS.has(t.definition.name))
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

import { RegisteredTool, ToolDefinition, ToolHandler } from './types';

const tools = new Map<string, RegisteredTool>();
const disabledTools = new Set<string>();

export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
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

export function enableTool(name: string): void {
  disabledTools.delete(name);
}

export function disableTool(name: string): void {
  disabledTools.add(name);
}

export function isToolEnabled(name: string): boolean {
  return !disabledTools.has(name);
}

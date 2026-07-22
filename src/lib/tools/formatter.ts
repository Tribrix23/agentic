import { ToolResult, RegisteredTool } from './types';

export function formatToolResultForLLM(toolName: string, result: ToolResult, maxChars: number = 10000): string {
  let output = result.output || '';
  
  if (output.length > maxChars) {
    output = output.substring(0, maxChars) + '\n...[Output truncated]';
    result.truncated = true;
  }
  
  let formatted = `Tool '${toolName}' result:\nSuccess: ${result.success}\nOutput:\n${output}`;
  return formatted;
}

export function formatToolDefinitionsForLLM(tools: RegisteredTool[]): any[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.definition.name,
      description: t.definition.description,
      parameters: t.definition.parameters,
    },
  }));
}

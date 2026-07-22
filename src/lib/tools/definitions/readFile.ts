import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'readFile',
  description: 'Read the contents of a file in the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file relative to project root or absolute' },
      startLine: { type: 'number', description: 'Optional start line (1-indexed)' },
      endLine: { type: 'number', description: 'Optional end line (1-indexed)' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'FileText'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, startLine, endLine } = args;
    const content = await (window as any).electron.readFileContent(path);
    
    let output = content;
    if (startLine !== undefined && endLine !== undefined) {
      const lines = content.split('\n');
      output = lines.slice(Math.max(0, startLine - 1), endLine).join('\n');
    }
    
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to read file: ${error.message || String(error)}` };
  }
};

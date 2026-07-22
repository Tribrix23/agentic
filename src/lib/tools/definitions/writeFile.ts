import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'writeFile',
  description: 'Write content to a file, completely overwriting it.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      content: { type: 'string', description: 'New content for the file' }
    },
    required: ['path', 'content']
  },
  requiresApproval: false,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'FilePen'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, content } = args;
    const result = await (window as any).electron.saveFileContent(path, content);
    
    if (result.success) {
      return { 
        success: true, 
        output: `Successfully wrote to ${path}`,
        artifacts: [{
          type: 'file_change',
          path,
          content
        }]
      };
    } else {
      return { success: false, output: `Failed to write file: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to write file: ${error.message || String(error)}` };
  }
};

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
    const { path: relativeOrAbsPath, content } = args;
    const targetPath = relativeOrAbsPath.startsWith('/') || /^[a-zA-Z]:\\/.test(relativeOrAbsPath) 
      ? relativeOrAbsPath 
      : `${context.projectRoot}/${relativeOrAbsPath}`.replace(/\/+/g, '/');
      
    const result = await (window as any).electron.saveFileContent(targetPath, content);
    
    if (result.success) {
      return { 
        success: true, 
        output: `Successfully wrote to ${targetPath}`,
        artifacts: [{
          type: 'file_change',
          path: targetPath,
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

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'createFile',
  description: 'Create a new empty file or with initial content.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to create' },
      content: { type: 'string', description: 'Optional initial content' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'moderate',
  timeout: 30000,
  icon: 'FilePlus'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, content } = args;
    
    // Resolve path relative to project root
    const normalizedPath = path.replace(/\\/g, '/');
    const fullPath = normalizedPath.startsWith('/') 
      ? normalizedPath 
      : `${context.projectRoot}/${normalizedPath}`.replace(/\/+/g, '/');
    
    // Extract directory and filename
    const parts = fullPath.split('/');
    const fileName = parts.pop() || '';
    const parentPath = parts.join('/') || context.projectRoot;
    
    const result = await (window as any).electron.createFile(parentPath, fileName, context.projectRoot);
    
    if (result.success) {
      if (content) {
        const writeResult = await (window as any).electron.saveFileContent(fullPath, content, { projectRoot: context.projectRoot });
        if (!writeResult.success) {
          return { success: false, output: `Created file but failed to write content: ${writeResult.error}` };
        }
      }
      return { 
        success: true, 
        output: `Successfully created ${path}`,
        artifacts: [{
          type: 'file_create',
          path: fullPath,
          content: content || ''
        }]
      };
    } else {
      return { success: false, output: `Failed to create file: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to create file: ${error.message || String(error)}` };
  }
};

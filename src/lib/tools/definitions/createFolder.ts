import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'createFolder',
  description: 'Create a new folder in the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the folder to create' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'moderate',
  timeout: 30000,
  icon: 'FolderPlus'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path } = args;
    
    // Resolve path relative to project root
    const normalizedPath = path.replace(/\\/g, '/');
    const fullPath = normalizedPath.startsWith('/') 
      ? normalizedPath 
      : `${context.projectRoot}/${normalizedPath}`.replace(/\/+/g, '/');
    
    // Extract parent directory and folder name
    const parts = fullPath.split('/');
    const folderName = parts.pop() || '';
    const parentPath = parts.join('/') || context.projectRoot;
    
    const result = await (window as any).electron.createFolder(parentPath, folderName);
    
    if (result.success) {
      return { 
        success: true, 
        output: `(No output)`
      };
    } else {
      return { success: false, output: `Failed to create folder: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to create folder: ${error.message || String(error)}` };
  }
};

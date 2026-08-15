import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'deleteFolder',
  description: 'Delete a folder and all its contents recursively from the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the folder to delete' }
    },
    required: ['path']
  },
  requiresApproval: true,
  dangerLevel: 'dangerous',
  timeout: 10000,
  icon: 'FolderMinus'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path } = args;
    
    // Path resolution
    let targetPath = path;
    const isAbsolute = path.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(path);
    if (isAbsolute) {
      targetPath = path.replace(/\\/g, '/');
    } else {
      const cleaned = path.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetPath = `${root}/${cleaned}`;
    }

    // deleteFile on backend handles folders properly via fs.rm(..., {recursive: true})
    const result = await (window as any).electron.deleteFile(targetPath);
    
    if (result.success) {
      return { 
        success: true, 
        output: `(No output)`
      };
    } else {
      return { success: false, output: `Failed to delete folder: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to delete folder: ${error.message || String(error)}` };
  }
};

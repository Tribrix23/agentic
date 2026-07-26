import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'deleteFile',
  description: 'Delete a file from the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file to delete' }
    },
    required: ['path']
  },
  requiresApproval: true,
  dangerLevel: 'dangerous',
  timeout: 10000,
  icon: 'FileX'
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

    const result = await (window as any).electron.deleteFile(targetPath);
    
    if (result.success) {
      return { 
        success: true, 
        output: `Successfully deleted ${path}`,
        artifacts: [{
          type: 'file_delete',
          path
        }]
      };
    } else {
      return { success: false, output: `Failed to delete file: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to delete file: ${error.message || String(error)}` };
  }
};

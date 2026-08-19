import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'renameFolder',
  description: 'Rename a folder in the project.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      oldPath: { type: 'string', description: 'Current path of the folder' },
      newPath: { type: 'string', description: 'New path for the folder' }
    },
    required: ['oldPath', 'newPath']
  },
  requiresApproval: true,
  dangerLevel: 'dangerous',
  timeout: 10000,
  icon: 'FolderEdit'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { oldPath, newPath } = args;
    
    const resolvePath = (p: string) => {
      let targetPath = p;
      const isAbsolute = p.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(p);
      if (isAbsolute) {
        targetPath = p.replace(/\\/g, '/');
      } else {
        const cleaned = p.replace(/^\.\//, '').replace(/^\//, '');
        const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
        targetPath = `${root}/${cleaned}`;
      }
      return targetPath;
    };

    const targetOld = resolvePath(oldPath);
    const targetNew = resolvePath(newPath);

    // renameFile on backend handles folders as well
    const result = await (window as any).electron.renameFile(targetOld, targetNew, context.projectRoot);
    
    if (result.success) {
      return { 
        success: true, 
        output: `(No output)`
      };
    } else {
      return { success: false, output: `Failed to rename folder: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to rename folder: ${error.message || String(error)}` };
  }
};

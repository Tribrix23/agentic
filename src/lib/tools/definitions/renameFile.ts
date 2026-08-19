import { ToolDefinition, ToolHandler } from '../types';

export const definition: ToolDefinition = {
  name: 'renameFile',
  description: 'Rename or move a file or directory.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Current path to the file or directory relative to project root' },
      newPath: { type: 'string', description: 'New path for the file or directory relative to project root' }
    },
    required: ['path', 'newPath']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 10000,
  icon: 'FileEdit'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path: relSource, newPath: relDest } = args;

    if (!relSource || !relDest) {
      return { success: false, output: 'Missing required arguments: path and newPath must be provided.' };
    }

    // ── Path resolution ──────────────────────────────────────────────────
    const isSourceAbsolute = relSource.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(relSource);
    let targetSource: string;
    if (isSourceAbsolute) {
      targetSource = relSource.replace(/\\/g, '/');
    } else {
      const cleaned = relSource.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetSource = `${root}/${cleaned}`;
    }

    const isDestAbsolute = relDest.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(relDest);
    let targetDest: string;
    if (isDestAbsolute) {
      targetDest = relDest.replace(/\\/g, '/');
    } else {
      const cleaned = relDest.replace(/^\.\//, '').replace(/^\//, '');
      const root = (context.projectRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
      targetDest = `${root}/${cleaned}`;
    }

    const result = await (window as any).electron.renameFile(targetSource, targetDest, context.projectRoot);
    if (!result?.success) throw new Error(result?.error || 'Rename failed');

    return { 
      success: true, 
      output: `Successfully renamed/moved:\nFrom: ${relSource}\nTo: ${relDest}` 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to rename file: ${error?.message || String(error)}` };
  }
};

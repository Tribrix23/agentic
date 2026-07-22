import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'gitCommit',
  description: 'Commit staged changes.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message' },
      cwd: { type: 'string', description: 'Optional working directory' }
    },
    required: ['message']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 20000,
  icon: 'GitCommitHorizontal'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { message, cwd = context.projectRoot } = args;
    const result = await (window as any).electron.gitCommit(cwd, message);
    
    if (result.success) {
      return { success: true, output: `Committed successfully with message: "${message}"` };
    } else {
      return { success: false, output: `Commit failed: ${result.error}` };
    }
  } catch (error: any) {
    return { success: false, output: `Failed to commit: ${error.message || String(error)}` };
  }
};

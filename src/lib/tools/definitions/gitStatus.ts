import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'gitStatus',
  description: 'Get the current git status.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Optional working directory' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'GitBranch'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const cwd = args.cwd || context.projectRoot;
    const result = await (window as any).electron.gitStatus(cwd);
    
    if (result.error) {
      return { success: false, output: `Git status failed: ${result.error}` };
    }
    
    return { success: true, output: result.data || 'Clean working tree' };
  } catch (error: any) {
    return { success: false, output: `Failed to get git status: ${error.message || String(error)}` };
  }
};

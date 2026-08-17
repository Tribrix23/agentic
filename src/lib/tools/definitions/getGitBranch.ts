import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'getGitBranch',
  description: 'Get the current git branch name.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'GitBranch'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const result = await (window as any).electron.runCommand('git rev-parse --abbrev-ref HEAD', context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to get branch: ${result.error}` };
    }
    
    const branch = result.stdout.trim();
    return { success: true, output: `Current branch: ${branch}` };
  } catch (error: any) {
    return { success: false, output: `Failed to get git branch: ${error.message || String(error)}` };
  }
};

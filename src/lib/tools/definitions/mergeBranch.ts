import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'mergeBranch',
  description: 'Merge a git branch into the current branch.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      branch: { type: 'string', description: 'Branch name to merge' },
      strategy: { type: 'string', description: 'Merge strategy (merge, squash, rebase)' }
    },
    required: ['branch']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 15000,
  icon: 'GitMerge'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { branch, strategy = 'merge' } = args;
    
    let command: string;
    if (strategy === 'merge') {
      command = `git merge ${branch}`;
    } else if (strategy === 'squash') {
      command = `git merge --squash ${branch}`;
    } else if (strategy === 'rebase') {
      command = `git rebase ${branch}`;
    } else {
      return { success: false, output: `Unknown strategy: ${strategy}` };
    }

    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Merge failed: ${result.error}` };
    }
    
    return { success: true, output: `Successfully merged branch: ${branch}` };
  } catch (error: any) {
    return { success: false, output: `Failed to merge branch: ${error.message || String(error)}` };
  }
};

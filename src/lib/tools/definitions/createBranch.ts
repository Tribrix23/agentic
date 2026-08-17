import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'createBranch',
  description: 'Create a new git branch and switch to it.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Branch name' },
      base: { type: 'string', description: 'Base branch to create from (default: current)' }
    },
    required: ['name']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 10000,
  icon: 'GitBranch'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { name, base } = args;
    
    let command = `git checkout -b ${name}`;
    if (base) {
      command = `git checkout -b ${name} ${base}`;
    }
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to create branch: ${result.error}` };
    }
    
    return { success: true, output: `Created and switched to branch: ${name}` };
  } catch (error: any) {
    return { success: false, output: `Failed to create branch: ${error.message || String(error)}` };
  }
};

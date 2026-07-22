import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'gitAdd',
  description: 'Stage files for commit.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      files: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'List of files to add, or ["."] for all'
      },
      cwd: { type: 'string', description: 'Optional working directory' }
    },
    required: ['files']
  },
  requiresApproval: false,
  dangerLevel: 'moderate',
  timeout: 20000,
  icon: 'GitBranch'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { files, cwd = context.projectRoot } = args;
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return { success: false, output: 'No files specified to add' };
    }
    
    let outputs: string[] = [];
    let allSuccess = true;
    
    for (const file of files) {
      const result = await (window as any).electron.gitAdd(cwd, file);
      if (result.success) {
        outputs.push(`Added: ${file}`);
      } else {
        allSuccess = false;
        outputs.push(`Failed to add ${file}: ${result.error}`);
      }
    }
    
    return { 
      success: allSuccess, 
      output: outputs.join('\n')
    };
  } catch (error: any) {
    return { success: false, output: `Failed to add files: ${error.message || String(error)}` };
  }
};

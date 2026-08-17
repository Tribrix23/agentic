import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'compareFiles',
  description: 'Compare two files and show the differences using diff.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path1: { type: 'string', description: 'Path to first file' },
      path2: { type: 'string', description: 'Path to second file' },
      unified: { type: 'boolean', description: 'Show unified diff format' }
    },
    required: ['path1', 'path2']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'GitCompare'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path1, path2, unified = true } = args;
    
    const targetPath1 = path1.startsWith('/') || /^[a-zA-Z]:\\/.test(path1) 
      ? path1 
      : `${context.projectRoot}/${path1}`.replace(/\/+/g, '/');
    const targetPath2 = path2.startsWith('/') || /^[a-zA-Z]:\\/.test(path2) 
      ? path2 
      : `${context.projectRoot}/${path2}`.replace(/\/+/g, '/');

    const flag = unified ? '-u' : '';
    const command = `diff ${flag} "${targetPath1}" "${targetPath2}"`;
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      // diff returns non-zero exit code when files differ, but still outputs the diff
      if (result.stdout) {
        return { success: true, output: result.stdout };
      }
      return { success: false, output: `Comparison failed: ${result.error}` };
    }
    
    const output = result.stdout || 'Files are identical';
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to compare files: ${error.message || String(error)}` };
  }
};

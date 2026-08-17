import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'formatCode',
  description: 'Format code using Prettier or ESLint. Supports multiple file types.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to file or directory to format' },
      formatter: { type: 'string', description: 'Formatter to use (prettier, eslint, auto)' },
      checkOnly: { type: 'boolean', description: 'Only check formatting without applying changes' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 20000,
  icon: 'Wand2'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path, formatter = 'auto', checkOnly = false } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    // Check if it's a file or directory
    const tree = await (window as any).electron.readProjectFiles(context.projectRoot);
    const isFile = path.includes('.') || !path.includes('/');
    
    let command: string;
    if (formatter === 'auto') {
      // Auto-detect based on file type
      if (path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.tsx') || path.endsWith('.json')) {
        command = `npx prettier ${checkOnly ? '--check' : '--write'} "${targetPath}"`;
      } else {
        command = `npx prettier ${checkOnly ? '--check' : '--write'} "${targetPath}"`;
      }
    } else if (formatter === 'prettier') {
      command = `npx prettier ${checkOnly ? '--check' : '--write'} "${targetPath}"`;
    } else if (formatter === 'eslint') {
      command = `npx eslint ${checkOnly ? '' : '--fix'} "${targetPath}"`;
    } else {
      return { success: false, output: `Unknown formatter: ${formatter}` };
    }

    // Execute the formatting command
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Formatting failed: ${result.error}` };
    }
    
    return { success: true, output: result.stdout || 'Code formatted successfully' };
  } catch (error: any) {
    return { success: false, output: `Failed to format code: ${error.message || String(error)}` };
  }
};

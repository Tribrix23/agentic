import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'getFileInfo',
  description: 'Get detailed information about a file including size, type, and last modified date.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' }
    },
    required: ['path']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'Info'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { path } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    const command = `ls -la "${targetPath}"`;
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to get file info: ${result.error}` };
    }
    
    // Get file size in human readable format
    const sizeCommand = `wc -c "${targetPath}"`;
    const sizeResult = await (window as any).electron.runCommand(sizeCommand, context.projectRoot);
    
    let output = result.stdout || '';
    if (!sizeResult.error) {
      output += `\nFile size: ${sizeResult.stdout.trim()} bytes`;
    }
    
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: `Failed to get file info: ${error.message || String(error)}` };
  }
};

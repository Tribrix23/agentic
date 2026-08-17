import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'compressFile',
  description: 'Compress a file or directory into a zip archive.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Path to file or directory to compress' },
      output: { type: 'string', description: 'Output zip file path' }
    },
    required: ['source', 'output']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Archive'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { source, output } = args;
    const sourcePath = source.startsWith('/') || /^[a-zA-Z]:\\/.test(source) 
      ? source 
      : `${context.projectRoot}/${source}`.replace(/\/+/g, '/');
    const outputPath = output.startsWith('/') || /^[a-zA-Z]:\\/.test(output) 
      ? output 
      : `${context.projectRoot}/${output}`.replace(/\/+/g, '/');

    const command = `zip -r "${outputPath}" "${sourcePath}"`;
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Compression failed: ${result.error}` };
    }
    
    return { success: true, output: `Compressed to: ${outputPath}` };
  } catch (error: any) {
    return { success: false, output: `Failed to compress: ${error.message || String(error)}` };
  }
};

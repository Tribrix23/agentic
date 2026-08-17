import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'extractArchive',
  description: 'Extract a zip, tar, or other archive file.',
  category: 'filesystem',
  parameters: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Path to archive file' },
      output: { type: 'string', description: 'Output directory (default: current directory)' }
    },
    required: ['source']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 30000,
  icon: 'Archive'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { source, output = '.' } = args;
    const sourcePath = source.startsWith('/') || /^[a-zA-Z]:\\/.test(source) 
      ? source 
      : `${context.projectRoot}/${source}`.replace(/\/+/g, '/');
    const outputPath = output.startsWith('/') || /^[a-zA-Z]:\\/.test(output) 
      ? output 
      : `${context.projectRoot}/${output}`.replace(/\/+/g, '/');

    let command: string;
    if (source.endsWith('.zip')) {
      command = `unzip "${sourcePath}" -d "${outputPath}"`;
    } else if (source.endsWith('.tar.gz') || source.endsWith('.tgz')) {
      command = `tar -xzf "${sourcePath}" -C "${outputPath}"`;
    } else if (source.endsWith('.tar')) {
      command = `tar -xf "${sourcePath}" -C "${outputPath}"`;
    } else {
      return { success: false, output: 'Unsupported archive format. Supported: .zip, .tar, .tar.gz, .tgz' };
    }

    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Extraction failed: ${result.error}` };
    }
    
    return { success: true, output: `Extracted to: ${outputPath}` };
  } catch (error: any) {
    return { success: false, output: `Failed to extract: ${error.message || String(error)}` };
  }
};

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'downloadFile',
  description: 'Download a file from a URL and save it to the project.',
  category: 'browser',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to download from' },
      path: { type: 'string', description: 'Local path to save the file' }
    },
    required: ['url', 'path']
  },
  requiresApproval: true,
  dangerLevel: 'moderate',
  timeout: 30000,
  icon: 'Download'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { url, path } = args;
    const targetPath = path.startsWith('/') || /^[a-zA-Z]:\\/.test(path) 
      ? path 
      : `${context.projectRoot}/${path}`.replace(/\/+/g, '/');

    // Use curl to download the file
    const command = `curl -L -o "${targetPath}" "${url}"`;
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Download failed: ${result.error}` };
    }
    
    return { success: true, output: `File downloaded to: ${targetPath}` };
  } catch (error: any) {
    return { success: false, output: `Failed to download file: ${error.message || String(error)}` };
  }
};

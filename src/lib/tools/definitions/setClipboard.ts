import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'setClipboard',
  description: 'Set the system clipboard content.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Content to set in clipboard' }
    },
    required: ['content']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'Clipboard'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { content } = args;
    
    const command = `powershell -Command "Set-Clipboard -Value '${content.replace(/'/g, "''")}'"`;
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to set clipboard: ${result.error}` };
    }
    
    return { success: true, output: 'Clipboard updated successfully.' };
  } catch (error: any) {
    return { success: false, output: `Failed to set clipboard: ${error.message || String(error)}` };
  }
};

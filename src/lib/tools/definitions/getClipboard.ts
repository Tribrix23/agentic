import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'getClipboard',
  description: 'Get the current content of the system clipboard.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      format: { type: 'string', description: 'Format to retrieve (text, html, image, default: text)' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'Clipboard'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { format = 'text' } = args;
    
    let command: string;
    if (format === 'text') {
      command = 'powershell -Command "Get-Clipboard"';
    } else if (format === 'html') {
      command = 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText([System.Windows.Forms.TextDataFormat]::Html)"';
    } else if (format === 'image') {
      return { success: false, output: 'Image clipboard format not yet supported. Use text format.' };
    } else {
      return { success: false, output: `Unsupported format: ${format}` };
    }
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to get clipboard: ${result.error}` };
    }
    
    const content = result.stdout?.trim() || 'Clipboard is empty.';
    return { success: true, output: content };
  } catch (error: any) {
    return { success: false, output: `Failed to get clipboard: ${error.message || String(error)}` };
  }
};

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'listWindows',
  description: 'List all open windows with their titles and process IDs.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'Window'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const command = 'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \"\"} | Select-Object Id, ProcessName, MainWindowTitle | Format-Table -AutoSize"';
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to list windows: ${result.error}` };
    }
    
    return { success: true, output: result.stdout || 'No windows found.' };
  } catch (error: any) {
    return { success: false, output: `Failed to list windows: ${error.message || String(error)}` };
  }
};

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'commandStatus',
  description: 'Get the status of a previously executed terminal command (task) by its ID. Returns the current status (running, done, error), and output lines.',
  category: 'terminal',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'ID of the task/command to get status for.' },
      maxBytes: { type: 'number', description: 'Maximum number of output bytes to read (default 50000).' }
    },
    required: ['taskId']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'TerminalSquare'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { taskId, maxBytes = 50000 } = args;
    
    const res = await (window as any).electron.taskStatus(taskId, maxBytes);
    if (!res.success) {
      return { success: false, output: `Failed to get status: ${res.error}` };
    }

    return { 
      success: true, 
      output: `Status: ${res.status.status}\nExit Code: ${res.status.exitCode ?? 'N/A'}\n\n=== Output ===\n${res.output}` 
    };
  } catch (error: any) {
    return { success: false, output: `Error getting task status: ${error.message || String(error)}` };
  }
};

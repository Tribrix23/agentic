import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'manageTask',
  description: 'Manage background tasks. Use this tool to list running tasks or interact with tasks that were sent to the background (e.g., kill or send input).',
  category: 'terminal',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'kill', 'send_input'], description: 'The action to perform.' },
      taskId: { type: 'string', description: 'The task ID to manage (required for kill and send_input).' },
      input: { type: 'string', description: 'The input to send (required for send_input).' }
    },
    required: ['action']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'Activity'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { action, taskId, input } = args;
    
    if (action === 'list') {
      const res = await (window as any).electron.taskList();
      if (!res || res.length === 0) return { success: true, output: 'No background tasks.' };
      return { success: true, output: JSON.stringify(res, null, 2) };
    }
    
    if (!taskId) return { success: false, output: 'taskId is required for this action.' };

    if (action === 'kill') {
      const res = await (window as any).electron.taskKill(taskId);
      return { success: res.success, output: res.success ? `Task ${taskId} killed.` : `Failed to kill task ${taskId}.` };
    }

    if (action === 'send_input') {
      if (!input) return { success: false, output: 'input is required for send_input.' };
      const res = await (window as any).electron.taskSendInput(taskId, input);
      return { success: res.success, output: res.success ? `Input sent to task ${taskId}.` : `Failed to send input.` };
    }

    return { success: false, output: `Unknown action: ${action}` };
  } catch (error: any) {
    return { success: false, output: `Error managing task: ${error.message || String(error)}` };
  }
};

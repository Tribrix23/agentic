import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'stopProcess',
  description: 'Gracefully stop or terminate a running process by ID or name.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      pid: { type: 'number', description: 'Process ID to stop' },
      name: { type: 'string', description: 'Process name to stop' },
      force: { type: 'boolean', description: 'Force stop if normal termination fails' }
    },
    required: []
  },
  requiresApproval: true,
  dangerLevel: 'dangerous',
  timeout: 10000,
  icon: 'XCircle'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { pid, name, force = false } = args;
    
    if (!pid && !name) {
      return { success: false, output: 'Either pid or name must be specified.' };
    }
    
    let command: string;
    if (pid) {
      command = `powershell -Command 'Stop-Process -Id ${pid} ${force ? '-Force' : ''}'`;
    } else if (name) {
      command = `powershell -Command 'Stop-Process -Name "${name}" ${force ? '-Force' : ''}'`;
    } else {
      return { success: false, output: 'Invalid parameters.' };
    }
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to stop process: ${result.error}` };
    }
    
    return { success: true, output: `Process terminated successfully.` };
  } catch (error: any) {
    return { success: false, output: `Failed to stop process: ${error.message || String(error)}` };
  }
};

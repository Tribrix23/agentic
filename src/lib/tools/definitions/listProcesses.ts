import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'listProcesses',
  description: 'List all running processes with their IDs, names, and resource usage.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Filter by process name (optional)' },
      top: { type: 'number', description: 'Show top N processes by CPU/Memory (default: 20)' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 10000,
  icon: 'Cpu'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { filter, top = 20 } = args;
    
    let command = `powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First ${top} | Select-Object Id, ProcessName, CPU, WorkingSet, StartTime | Format-Table -AutoSize"`;
    
    if (filter) {
      command = `powershell -Command "Get-Process -Name '*${filter}*' | Select-Object Id, ProcessName, CPU, WorkingSet, StartTime | Format-Table -AutoSize"`;
    }
    
    const result = await (window as any).electron.runCommand(command, context.projectRoot);
    
    if (result.error) {
      return { success: false, output: `Failed to list processes: ${result.error}` };
    }
    
    return { success: true, output: result.stdout || 'No processes found.' };
  } catch (error: any) {
    return { success: false, output: `Failed to list processes: ${error.message || String(error)}` };
  }
};

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'runCommand',
  description: 'Run a shell command asynchronously. Returns a Task ID immediately. Use manageTask or commandStatus to interact with or check on it.',
  category: 'terminal',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run' },
      cwd: { type: 'string', description: 'Optional working directory' },
      waitMsBeforeAsync: { type: 'number', description: 'Optional: milliseconds to wait to see if it finishes quickly before returning the taskId (default 500ms).' }
    },
    required: ['command']
  },
  requiresApproval: false,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'Terminal'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { command, cwd, waitMsBeforeAsync = 500 } = args;
    
    let targetCwd = context.projectRoot;
    if (cwd && cwd !== '.') {
      targetCwd = cwd.startsWith('/') || /^[a-zA-Z]:\\/.test(cwd) 
        ? cwd 
        : `${context.projectRoot}/${cwd}`.replace(/\/+/g, '/');
    }

    // Call the Electron backend to spawn the task
    const res = await (window as any).electron.taskSpawn(command, targetCwd);
    if (!res.success) {
      return { success: false, output: `Failed to spawn task: ${res.error}` };
    }

    const taskId = res.taskId;

    // Optional wait to see if it completes synchronously (for quick commands like 'ls' or 'echo')
    if (waitMsBeforeAsync > 0) {
      await new Promise(resolve => setTimeout(resolve, waitMsBeforeAsync));
      const statusRes = await (window as any).electron.taskStatus(taskId, 50000);
      if (statusRes.success && (statusRes.status.status === 'done' || statusRes.status.status === 'error')) {
        return {
          success: statusRes.status.status === 'done',
          output: statusRes.output || '(No output)'
        };
      }
    }

    return { 
      success: true, 
      output: `Command spawned in background. Task ID: ${taskId}.\nThe command is still running. Use the manageTask or commandStatus tools to check output or kill it later.` 
    };
  } catch (error: any) {
    return { success: false, output: `Error dispatching command: ${error.message || String(error)}` };
  }
};

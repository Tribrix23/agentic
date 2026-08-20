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
      literal: { type: 'boolean', description: 'If true, bypasses cross-platform Unix command translation (e.g. rm -> del). High danger level.' },
      waitMsBeforeAsync: { type: 'number', description: 'Optional: milliseconds to wait to see if it finishes quickly before returning the taskId (default 500ms).' }
    },
    required: ['command']
  },
  requiresApproval: true,
  dangerLevel: 'dangerous',
  timeout: 30000,
  icon: 'Terminal'
};

import { TerminalTools } from '../TerminalTools';

export const handler: ToolHandler = async (args, context) => {
  try {
    const { command, cwd, waitMsBeforeAsync = 500 } = args;
    
    let targetCwd = context.projectRoot;
    if (cwd && cwd !== '.') {
      targetCwd = cwd.startsWith('/') || /^[a-zA-Z]:\\/.test(cwd) 
        ? cwd 
        : `${context.projectRoot}/${cwd}`.replace(/\/+/g, '/');
    }

    // Optional: still support waitMsBeforeAsync if we want to allow long tasks, but the user explicitly requested blocking terminal style.
    let outputStr = '';
    
    if (args.literal) {
      // Execute literal command directly via runCommandCapture
      const res = await (window as any).electron.runCommandCapture(command, targetCwd);
      if (res.stdout) outputStr += res.stdout + '\n';
      if (res.stderr) outputStr += res.stderr + '\n';
      if (res.error && !res.success) outputStr += res.error;
      return { success: res.success, output: outputStr.trim() || '(No output)' };
    } else {
      // Execute through TerminalTools for cross-platform aliases
      const output = await TerminalTools.executeCommand({ command, cwd: targetCwd });
      return { success: !output.toLowerCase().includes('error'), output: output.trim() || '(No output)' };
    }
  } catch (error: any) {
    return { success: false, output: `Error dispatching command: ${error.message || String(error)}` };
  }
};

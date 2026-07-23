import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'runCommand',
  description: 'Run a shell command in the terminal.',
  category: 'terminal',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run' },
      cwd: { type: 'string', description: 'Optional working directory' }
    },
    required: ['command']
  },
  requiresApproval: false, // In practice, depends on config
  dangerLevel: 'dangerous',
  timeout: 60000,
  icon: 'Terminal'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { command, cwd } = args;
    
    return await new Promise<ToolResult>((resolve) => {
      // Simulate by dispatching custom event and waiting for result
      // This bridges to a higher level component that manages the terminal IPC
      const eventId = Math.random().toString(36).substring(7);
      
      const handleResult = (e: any) => {
        if (e.detail.id === eventId) {
          window.removeEventListener('agent-command-result', handleResult);
          
          if (e.detail.success) {
            resolve({ 
              success: true, 
              output: e.detail.output || 'Command executed successfully',
              artifacts: [{
                type: 'terminal_output',
                content: e.detail.output
              }]
            });
          } else {
            resolve({ success: false, output: `Command failed: ${e.detail.error || e.detail.output}` });
          }
        }
      };
      
      window.addEventListener('agent-command-result', handleResult);
      
      let targetCwd = context.projectRoot;
      if (cwd && cwd !== '.') {
        targetCwd = cwd.startsWith('/') || /^[a-zA-Z]:\\/.test(cwd) 
          ? cwd 
          : `${context.projectRoot}/${cwd}`.replace(/\/+/g, '/');
      }

      // Tell UI to run it
      window.dispatchEvent(new CustomEvent('agent-run-command', { 
        detail: { id: eventId, command, cwd: targetCwd } 
      }));
      
      // Cleanup on abort
      context.signal.addEventListener('abort', () => {
        window.removeEventListener('agent-command-result', handleResult);
        resolve({ success: false, output: 'Command execution aborted' });
      });
    });
  } catch (error: any) {
    return { success: false, output: `Failed to run command: ${error.message || String(error)}` };
  }
};

import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'gitDiff',
  description: 'Show changes between commits, commit and working tree, etc.',
  category: 'git',
  parameters: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'Optional specific file to diff' },
      cwd: { type: 'string', description: 'Optional working directory' }
    },
    required: []
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 20000,
  icon: 'GitCompare'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { file, cwd = context.projectRoot } = args;
    
    const command = file ? `git diff "${file}"` : 'git diff';
    
    return await new Promise<ToolResult>((resolve) => {
      const eventId = Math.random().toString(36).substring(7);
      
      const handleResult = (e: any) => {
        if (e.detail.id === eventId) {
          window.removeEventListener('agent-command-result', handleResult);
          
          if (e.detail.success) {
            const output = e.detail.output || 'No changes found';
            resolve({ 
              success: true, 
              output,
              artifacts: output !== 'No changes found' ? [{
                type: 'diff',
                diff: output
              }] : []
            });
          } else {
            resolve({ success: false, output: `git diff failed: ${e.detail.error || e.detail.output}` });
          }
        }
      };
      
      window.addEventListener('agent-command-result', handleResult);
      window.dispatchEvent(new CustomEvent('agent-run-command', { 
        detail: { id: eventId, command, cwd } 
      }));
      
      context.signal.addEventListener('abort', () => {
        window.removeEventListener('agent-command-result', handleResult);
        resolve({ success: false, output: 'git diff aborted' });
      });
    });
  } catch (error: any) {
    return { success: false, output: `Failed to run git diff: ${error.message || String(error)}` };
  }
};

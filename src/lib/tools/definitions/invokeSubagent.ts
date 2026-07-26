import { ToolDefinition, ToolHandler, ToolResult } from '../types';

export const definition: ToolDefinition = {
  name: 'invokeSubagent',
  description: 'Invokes a subagent to perform a concurrent task. The subagent will run in the background and report back its results.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The detailed task for the subagent to perform.' },
      role: { type: 'string', description: 'The role of the subagent (e.g., Researcher, Coder)' }
    },
    required: ['task', 'role']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 300000,
  icon: 'Bot'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { task, role } = args;
    const conversationId = 'sub_' + Math.random().toString(36).substring(2, 9);
    
    // Dispatch event to MainContent to actually spin up a new AgentLoop
    window.dispatchEvent(new CustomEvent('spawn-subagent', {
      detail: {
        conversationId,
        role,
        task,
        projectRoot: context.projectRoot
      }
    }));

    return { 
      success: true, 
      output: `Subagent invoked successfully. Conversation ID: ${conversationId}. You can use sendMessage to communicate with it, or wait for it to report back.` 
    };
  } catch (error: any) {
    return { success: false, output: `Failed to invoke subagent: ${error.message || String(error)}` };
  }
};

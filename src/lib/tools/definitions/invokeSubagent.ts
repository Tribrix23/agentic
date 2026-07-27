import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { updateTask } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'invokeSubagent',
  description: 'Invokes a sub-agent to perform a task in parallel. The sub-agent runs independently and reports back. The main agent loop will be woken up when the sub-agent completes. Pass taskId to automatically update the task status when the sub-agent finishes.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The detailed task for the sub-agent to perform.' },
      role: { type: 'string', description: 'The role of the sub-agent (e.g., Coder, Researcher, Designer)' },
      taskId: { type: 'string', description: 'Optional task ID from createTodoListTask to link this sub-agent to a task. The task will be marked delegated and completed when the sub-agent finishes.' }
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
    const { task, role, taskId } = args;
    const conversationId = 'sub_' + Math.random().toString(36).substring(2, 9);
    
    // If a taskId was provided, mark the task as delegated immediately
    if (taskId) {
      updateTask(taskId, { 
        status: 'in_progress', 
        delegatedTo: conversationId 
      });
    }

    // Dispatch event to MainContent to spin up a new AgentLoop
    window.dispatchEvent(new CustomEvent('spawn-subagent', {
      detail: {
        conversationId,
        role,
        task,
        projectRoot: context.projectRoot,
        parentConversationId: context.conversationId,
        taskId // Pass taskId so MainContent can mark it completed when done
      }
    }));

    return { 
      success: true, 
      output: `Sub-agent spawned successfully. Sub-agent ID: ${conversationId}. Role: ${role}. The main loop will be woken up when the sub-agent completes. You can now work on other tasks in parallel.`
    };
  } catch (error: any) {
    return { success: false, output: `Failed to invoke sub-agent: ${error.message || String(error)}` };
  }
};

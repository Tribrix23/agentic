import { ToolDefinition, ToolHandler } from '../types';
import { updateTask } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'updateTaskStatus',
  description: 'Update the status of a task in the to-do list. Call this after completing a task to mark it as completed, or when starting work to mark it in_progress.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID returned by createTodoListTask.' },
      status: { 
        type: 'string', 
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        description: 'The new status for the task.'
      },
      delegatedTo: { 
        type: 'string', 
        description: 'Optional: sub-agent conversationId if delegating this task.' 
      }
    },
    required: ['taskId', 'status']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'CheckCircle'
};

export const handler: ToolHandler = async (args) => {
  try {
    const { taskId, status, delegatedTo } = args;
    const updates: any = { status };
    if (delegatedTo) updates.delegatedTo = delegatedTo;

    const updated = updateTask(taskId, updates);
    if (!updated) {
      return { success: false, output: `Task ${taskId} not found.` };
    }
    return { 
      success: true, 
      output: `Task "${updated.title}" (${taskId}) updated to status: ${status}.`
    };
  } catch (error: any) {
    return { success: false, output: `Failed to update task: ${error.message || String(error)}` };
  }
};

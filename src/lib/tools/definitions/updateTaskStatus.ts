import { ToolDefinition, ToolHandler } from '../types';
import { updateTask, getTask } from '../../taskStore';

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
    },
    required: ['taskId', 'status']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'CheckCircle'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { taskId, status } = args;
    const task = getTask(taskId);
    if (!task) return { success: false, output: `Task ${taskId} not found.` };
    if (context.conversationId && task.conversationId !== context.conversationId) return { success: false, output: 'Task belongs to another conversation.' };
    if (task.delegatedTo) return { success: false, output: 'Delegated tasks are updated by the sub-agent lifecycle.' };
    if (status === 'completed') {
      const blocked = task.dependencies.some(dependencyId => getTask(dependencyId)?.status !== 'completed');
      if (blocked) return { success: false, output: 'Cannot complete a task while dependencies are unresolved.' };
    }
    const updates: any = { status };

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

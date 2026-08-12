import { ToolDefinition, ToolHandler } from '../types';
import { createTask } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'createTodoListTasks',
  description: 'Create multiple tasks in the agentic to-do list at once. Use this to decompose a complex request into a complete plan of tasks upfront. Returns an array of task IDs which you should store to update their status later. IMPORTANT: Tasks will be executed in dependency order - only tasks with all dependencies completed will be available for delegation.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'The list of tasks to create.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The title of the task.' },
            description: { type: 'string', description: 'Detailed description of what needs to be done.' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'The priority of the task.' },
            dependencies: { type: 'array', items: { type: 'string' }, description: 'Array of task IDs (or local references like "task_1") that must be completed before this one. Leave empty if none.' },
            delegatedTo: { type: 'string', description: 'Optional sub-agent conversationId this task is delegated to.' },
            targetFile: { type: 'string', description: 'The exact file path this task is responsible for creating or editing. Used for verification.' }
          },
          required: ['title', 'description']
        }
      }
    },
    required: ['tasks']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 5000,
  icon: 'ListTodo'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    let { tasks } = args;
    
    // If tasks is a stringified JSON array, parse it (handle double stringification)
    let parseAttempts = 0;
    while (typeof tasks === 'string' && parseAttempts < 3) {
      try {
        tasks = JSON.parse(tasks);
      } catch (e) {
        break; // Stop parsing if it's not valid JSON anymore
      }
      parseAttempts++;
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { success: false, output: 'No tasks provided in the array. You provided: ' + JSON.stringify(args.tasks) };
    }
    
    const createdTasks = [];
    
    for (const t of tasks) {
      const task = createTask({
        title: t.title,
        description: t.description,
        priority: t.priority || 'medium',
        dependencies: t.dependencies || [],
        delegatedTo: t.delegatedTo || undefined,
        tags: ['agent-created'],
        conversationId: context.conversationId,
        projectId: context?.projectRoot || '',
        metadata: t.targetFile ? { targetFile: t.targetFile } : undefined,
      });
      createdTasks.push(task.id);
    }

    return { 
      success: true, 
      output: `Successfully created ${createdTasks.length} tasks. Task IDs: \n${createdTasks.map(id => `- ${id}`).join('\n')}\n\nIMPORTANT: Tasks will be executed in dependency order. Only delegate tasks whose dependencies are completed. Use invokeSubagent with the taskId and targetFile for each task.`
    };
  } catch (error: any) {
    return { success: false, output: `Failed to create tasks: ${error.message || String(error)}` };
  }
};

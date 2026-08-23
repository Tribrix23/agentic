import { ToolDefinition, ToolHandler } from '../types';
import { createTask, updateTask } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'createTodoListTasks',
  description: 'Create the complete dependency graph before execution. Every task should include its target file when applicable and dependencies must use local IDs such as task_1. The scheduler determines the ready wave; invokeSubagent requires the returned taskId.',
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
          required: ['title']
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
    const localIds = new Map<string, string>();
    
    for (let index = 0; index < tasks.length; index++) {
      const t = tasks[index];
      const task = createTask({
        title: t.title,
        description: t.description,
        priority: t.priority || 'medium',
        dependencies: [],
        delegatedTo: t.delegatedTo || undefined,
        tags: ['agent-created'],
        conversationId: context.conversationId,
        projectId: context?.projectRoot || '',
        metadata: t.targetFile ? { targetFile: t.targetFile } : undefined,
      });
      createdTasks.push(task.id);
      localIds.set(`task_${index + 1}`, task.id);
      if (typeof t.id === 'string' && t.id.trim()) localIds.set(t.id.trim(), task.id);
    }

    for (let index = 0; index < tasks.length; index++) {
      const dependencies = Array.isArray(tasks[index].dependencies)
        ? tasks[index].dependencies.map((dependency: string) => localIds.get(dependency) || dependency)
        : [];
      if (dependencies.length > 0) updateTask(createdTasks[index], { dependencies });
    }

    return { 
      success: true, 
      output: `Successfully created ${createdTasks.length} tasks. Task IDs: \n${createdTasks.map((id, index) => `- task_${index + 1} -> ${id}`).join('\n')}\n\nOnly currently ready tasks may be delegated. Use invokeSubagent with the taskId; after a wave completes, recompute the graph for the next wave.`
    };
  } catch (error: any) {
    return { success: false, output: `Failed to create tasks: ${error.message || String(error)}` };
  }
};

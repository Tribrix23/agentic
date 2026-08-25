import { ToolDefinition, ToolHandler } from '../types';
import { createTaskBatch, getDurableTasksForConversation } from '../../taskStore';
import { TaskGraph } from '../../taskGraph';

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
            id: { type: 'string', description: 'Optional unique local ID for this task.' },
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
    
    const existing = context.conversationId ? getDurableTasksForConversation(context.conversationId) : [];
    if (existing.length > 0) {
      return { success: true, output: `A durable task graph already exists for this conversation (${existing.length} tasks). Use its existing task IDs; no duplicate graph was created.`, data: { tasks: existing, idMapping: {}, readyTaskIds: new TaskGraph(existing).getExecutableTasks().map(task => task.id) } };
    }

    const localIds = new Map<string, number>();
    for (let index = 0; index < tasks.length; index++) {
      const aliases = [`task_${index + 1}`];
      if (typeof tasks[index].id === 'string' && tasks[index].id.trim()) aliases.push(tasks[index].id.trim());
      for (const alias of aliases) {
        if (localIds.has(alias)) return { success: false, output: `Duplicate local task ID: ${alias}.` };
        localIds.set(alias, index);
      }
    }
    const normalizedDependencies: number[][] = [];
    for (let index = 0; index < tasks.length; index++) {
      const dependencies = Array.isArray(tasks[index].dependencies) ? tasks[index].dependencies : [];
      const resolved = dependencies.map((dependency: string) => {
        const depIndex = localIds.get(String(dependency).trim());
        if (depIndex === undefined) throw new Error(`Unknown dependency '${dependency}' for task_${index + 1}.`);
        if (depIndex === index) throw new Error(`Task task_${index + 1} cannot depend on itself.`);
        return depIndex;
      });
      normalizedDependencies.push(resolved);
    }
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (index: number): void => {
      if (visiting.has(index)) throw new Error(`Circular dependency detected at task_${index + 1}.`);
      if (visited.has(index)) return;
      visiting.add(index);
      normalizedDependencies[index].forEach(dep => visit(dep));
      visiting.delete(index);
      visited.add(index);
    };
    tasks.forEach((_: unknown, index: number) => visit(index));

    const created = createTaskBatch(tasks.map((t: any, index: number) => ({
      title: String(t.title || '').trim(),
      description: t.description || '',
      priority: t.priority || 'medium',
      dependencies: [] as string[],
      delegatedTo: t.delegatedTo || undefined,
      tags: ['agent-created'],
      conversationId: context.conversationId,
      projectId: context.projectRoot || '',
      metadata: t.targetFile ? { targetFile: t.targetFile } : {},
    })), normalizedDependencies);
    const idMapping: Record<string, string> = {};
    created.forEach((task, index) => {
      idMapping[`task_${index + 1}`] = task.id;
      if (typeof tasks[index].id === 'string' && tasks[index].id.trim()) idMapping[tasks[index].id.trim()] = task.id;
    });
    const finalTasks = created;

    return { 
      success: true, 
      output: `Successfully created ${finalTasks.length} tasks. Task IDs: \n${finalTasks.map((task, index) => `- task_${index + 1} -> ${task.id}`).join('\n')}\n\nOnly currently ready tasks may be delegated. Use invokeSubagent with the taskId; after a wave completes, recompute the graph for the next wave.`,
      data: { tasks: finalTasks, idMapping, readyTaskIds: new TaskGraph(finalTasks).getExecutableTasks().map(task => task.id) },
    };
  } catch (error: any) {
    return { success: false, output: `Failed to create tasks: ${error.message || String(error)}` };
  }
};

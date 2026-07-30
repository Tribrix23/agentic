import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { updateTask, createTask } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'invokeSubagent',
  description: 'Invokes a sub-agent to perform a task in parallel. The sub-agent runs independently and reports back. The main agent loop will be woken up when the sub-agent completes. Pass taskId to automatically update the task status when the sub-agent finishes.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The detailed task for the sub-agent to perform.' },
      role: { type: 'string', description: 'The role of the sub-agent (e.g., Coder, Researcher, Designer)' },
      taskId: { type: 'string', description: 'Optional task ID from createTodoListTasks to link this sub-agent to a task. If omitted, a task is auto-created.' },
      targetFile: { type: 'string', description: 'The exact file path this sub-agent is responsible for creating or editing.' }
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
    let { task, role, taskId, targetFile } = args;
    const conversationId = 'sub_' + Math.random().toString(36).substring(2, 9);
    
    // Auto-create a task if no taskId was provided
    if (!taskId) {
      const autoTask = createTask({
        title: task.slice(0, 80),
        description: task,
        priority: 'high',
        dependencies: [],
        tags: ['agent-created', 'auto'],
        conversationId: context.conversationId,
        projectId: context.projectRoot || '',
      });
      taskId = autoTask.id;
    }
    
    // Mark the task as delegated immediately
    updateTask(taskId, { 
      status: 'in_progress', 
      delegatedTo: conversationId 
    });

    // Dispatch event to MainContent to spin up a new AgentLoop
    window.dispatchEvent(new CustomEvent('spawn-subagent', {
      detail: {
        conversationId,
        role,
        task,
        projectRoot: context.projectRoot,
        parentConversationId: context.conversationId,
        taskId, // Pass taskId so MainContent can mark it completed when done
        targetFile // Pass targetFile so the UI knows what it is working on
      }
    }));

    return { 
      success: true, 
      output: `Sub-agent spawned successfully. Sub-agent ID: ${conversationId}. Role: ${role}. DO NOT use commandStatus or manageTask on this! Sub-agents are independent AI agents, not terminal commands. The main loop will automatically wake up when they finish. Go to sleep now.`
    };
  } catch (error: any) {
    return { success: false, output: `Failed to invoke sub-agent: ${error.message || String(error)}` };
  }
};

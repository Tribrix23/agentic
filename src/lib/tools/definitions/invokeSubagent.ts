import { ToolDefinition, ToolHandler, ToolResult } from '../types';
import { updateTask, getTask, getTasksForConversation } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'invokeSubagent',
  description: 'Invokes a sub-agent for a bounded analysis or implementation task when delegation materially improves speed or handles complexity. The sub-agent runs independently and reports back, then the main loop wakes automatically. Provide complete scope and context. Implementation tasks should identify the owned targetFile; read-only analysis tasks may omit targetFile and must not mutate files.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The detailed task for the sub-agent to perform.' },
      role: { type: 'string', description: 'The role of the sub-agent (e.g., Coder, Researcher, Designer)' },
      taskId: { type: 'string', description: 'Required task ID returned by createTodoListTasks. Only currently executable tasks may be delegated.' },
      targetFile: { type: 'string', description: 'For implementation tasks, the exact file path this sub-agent owns. Omit for read-only analysis.' }
    },
    required: ['task', 'role', 'taskId']
  },
  requiresApproval: false,
  dangerLevel: 'safe',
  timeout: 300000,
  icon: 'Bot'
};

export const handler: ToolHandler = async (args, context) => {
  try {
    const { task, role, taskId, targetFile } = args;
    const conversationId = 'sub_' + Math.random().toString(36).substring(2, 9);

    if (!taskId) {
      return { success: false, output: 'Cannot delegate without taskId. Create the complete task graph first, then delegate a ready task.' };
    }

    const taskObj = getTask(taskId);
    if (!taskObj) return { success: false, output: `Cannot delegate unknown task ${taskId}.` };
    if (context.conversationId && taskObj.conversationId !== context.conversationId) {
      return { success: false, output: `Cannot delegate task ${taskId}: it belongs to another conversation.` };
    }
    if (taskObj.status !== 'pending') {
      return { success: false, output: `Cannot delegate task ${taskId}: current status is ${taskObj.status}.` };
    }

    const incompleteDeps = taskObj.dependencies.filter(depId => {
      const depTask = getTask(depId);
      return !depTask || depTask.status !== 'completed';
    });
    if (incompleteDeps.length > 0) {
      return { success: false, output: `Cannot delegate task ${taskId}: prerequisites are incomplete (${incompleteDeps.join(', ')}).` };
    }

    const plannedTarget = taskObj.metadata?.targetFile;
    const claimedTarget = targetFile || plannedTarget;
    const siblingTasks = context.conversationId ? getTasksForConversation(context.conversationId) : [];
    if (claimedTarget) {
      const normalizedTarget = String(claimedTarget).replace(/\\/g, '/').toLowerCase();
      const conflict = siblingTasks.find(sibling => sibling.id !== taskId && sibling.status === 'in_progress' && sibling.metadata?.targetFile && String(sibling.metadata.targetFile).replace(/\\/g, '/').toLowerCase() === normalizedTarget);
      if (conflict) {
        return { success: false, output: `Cannot delegate task ${taskId}: target file is already owned by active task ${conflict.id}.` };
      }
    }
    
    // Mark the task as delegated immediately
    updateTask(taskId, { 
      status: 'in_progress', 
      delegatedTo: conversationId,
      metadata: { ...(taskObj.metadata || {}), targetFile: claimedTarget }
    });

    // Synchronously notify parent loop if available (fixes race condition)
    if (context.parentLoop && typeof context.parentLoop.notifySubagentSpawned === 'function') {
      context.parentLoop.notifySubagentSpawned();
    }

    // Dispatch event to MainContent to spin up a new AgentLoop
    window.dispatchEvent(new CustomEvent('spawn-subagent', {
      detail: {
        conversationId,
        role,
        task,
        projectRoot: context.projectRoot,
        parentConversationId: context.conversationId,
        taskId, // Pass taskId so MainContent can mark it completed when done
        targetFile: claimedTarget // Pass the planned claim so the UI knows what it is working on
        ,agentKind: 'subagent'
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

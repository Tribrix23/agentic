import { ToolDefinition, ToolHandler } from '../types';
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
    
    if (!context.subagentManager) return { success: false, output: 'Subagent runtime is unavailable.' };

    // Mark the task as delegated immediately. The manager owns child lifecycle from here.
    updateTask(taskId, { 
      status: 'in_progress', 
      delegatedTo: 'pending-child-run',
      metadata: { ...(taskObj.metadata || {}), targetFile: claimedTarget }
    });
    const child = context.subagentManager.start({
      parentRunId: context.runId,
      parentConversationId: context.conversationId || taskObj.conversationId,
      taskId, task, role, projectRoot: context.projectRoot, targetFile: claimedTarget,
    }, context.signal);
    updateTask(taskId, { delegatedTo: child.handle.childId });
    const outcome = await child.outcome;
    updateTask(taskId, {
      status: outcome.status === 'completed' ? 'completed' : 'failed',
      metadata: { ...(getTask(taskId)?.metadata || {}), subagentOutcome: outcome, error: outcome.status === 'completed' ? undefined : outcome.summary },
    });
    return {
      success: outcome.status === 'completed',
      output: JSON.stringify(outcome, null, 2),
      summary: outcome.summary,
      data: outcome,
      artifacts: outcome.artifacts,
      diagnostics: outcome.diagnostics,
    };
  } catch (error: any) {
    return { success: false, output: `Failed to invoke sub-agent: ${error.message || String(error)}` };
  }
};

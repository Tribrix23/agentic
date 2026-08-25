import { ToolDefinition, ToolHandler } from '../types';
import { updateTask, getTask, getTasksForConversation } from '../../taskStore';

export const definition: ToolDefinition = {
  name: 'invokeSubagent',
  description: 'Invokes a sub-agent for a bounded analysis or implementation task. Set readOnly true for analysis without a target file; implementation tasks must own the planned targetFile.',
  category: 'system',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The detailed task for the sub-agent to perform.' },
      role: { type: 'string', description: 'The role of the sub-agent (e.g., Coder, Researcher, Designer)' },
      taskId: { type: 'string', description: 'Required task ID returned by createTodoListTasks. Only currently executable tasks may be delegated.' },
      targetFile: { type: 'string', description: 'For implementation tasks, the exact file path this sub-agent owns. Omit for read-only analysis.' }
      ,readOnly: { type: 'boolean', description: 'Required true for read-only analysis. False requires the planned targetFile.' }
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
    const { task, role, taskId, targetFile, readOnly } = args;
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
    if (typeof readOnly !== 'boolean') return { success: false, output: 'Delegation must declare readOnly true or false.' };
    if (readOnly && (targetFile || plannedTarget)) return { success: false, output: 'Read-only delegation cannot claim a target file.' };
    if (!readOnly && !plannedTarget) return { success: false, output: 'Implementation delegation requires the task planned targetFile.' };
    const normalizeTarget = (value: string) => String(value).replace(/\\/g, '/').replace(/\/\.\//g, '/').toLowerCase();
    if (targetFile && plannedTarget && normalizeTarget(targetFile) !== normalizeTarget(plannedTarget)) return { success: false, output: `Cannot delegate task ${taskId}: targetFile differs from the planned target.` };
    const claimedTarget = readOnly ? undefined : (targetFile || plannedTarget);
    const siblingTasks = context.conversationId ? getTasksForConversation(context.conversationId) : [];
    if (claimedTarget) {
      const normalizedTarget = normalizeTarget(claimedTarget);
      const conflict = siblingTasks.find(sibling => sibling.id !== taskId && sibling.status === 'in_progress' && sibling.metadata?.targetFile && normalizeTarget(sibling.metadata.targetFile) === normalizedTarget);
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
      parentConversationId: context.conversationId || taskObj.conversationId || '',
      taskId, task, role, projectRoot: context.projectRoot, targetFile: claimedTarget, readOnly,
    }, context.signal);
    updateTask(taskId, { delegatedTo: child.handle.childId });
    const outcome = await child.outcome;
    const expectedTarget = claimedTarget && normalizeTarget(claimedTarget);
    const reportedTarget = outcome.changedFiles.map(normalizeTarget);
    const evidenceValid = outcome.status === 'completed' && outcome.unresolvedItems.length === 0 && (!expectedTarget || reportedTarget.includes(expectedTarget));
    const finalStatus = outcome.status === 'cancelled' ? 'cancelled' : evidenceValid ? 'completed' : 'failed';
    updateTask(taskId, {
      status: finalStatus,
      metadata: { ...(getTask(taskId)?.metadata || {}), subagentOutcome: outcome, error: outcome.status === 'completed' ? undefined : outcome.summary },
    });
    return {
      success: finalStatus === 'completed',
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

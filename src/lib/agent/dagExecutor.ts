import { SubagentManager } from './subagentManager';
import { GitWorktreeSandbox } from './gitWorktreeSandbox';
import { getTask, updateTask } from '../taskStore';

export class DagExecutor {
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private subagentManager: SubagentManager;
  private projectRoot: string;
  private activeTasks: Set<string> = new Set();

  constructor(subagentManager: SubagentManager, projectRoot: string) {
    this.subagentManager = subagentManager;
    this.projectRoot = projectRoot;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Poll the SQLite database every 2 seconds for ready tasks
    this.intervalId = setInterval(() => {
      this.tick();
    }, 2000);
    console.log('[DagExecutor] Started background daemon.');
  }

  public stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[DagExecutor] Stopped background daemon.');
  }

  private async tick() {
    if (!this.isRunning) return;

    try {
      // 1. Fetch all tasks from DB
      // We can't use getAllTasks() directly here if it's imported from backend while we are in the renderer?
      // Wait, if DagExecutor runs in the renderer, it must use IPC:
      // const tasks = (window as any).electron.dbGetAllTasks();
      const tasks = (window as any).electron.dbGetAllTasks();

      // 2. Find tasks that are 'pending' and have all dependencies met ('completed')
      for (const task of tasks) {
        if (task.status === 'pending' && task.delegatedTo === 'dag-queue' && !this.activeTasks.has(task.id)) {
          
          // Check if dependencies are met
          const deps = task.dependencies || [];
          const allDepsCompleted = deps.every((depId: string) => {
            const depTask = tasks.find((t: any) => t.id === depId);
            return depTask && depTask.status === 'completed';
          });

          if (allDepsCompleted) {
            console.log(`[DagExecutor] Task ${task.id} dependencies met! Spawning swarm subagent...`);
            this.activeTasks.add(task.id);
            this.spawnTask(task).catch(console.error);
          }
        }
      }
    } catch (e: any) {
      console.error('[DagExecutor] Tick error:', e);
    }
  }

  private async spawnTask(task: any) {
    try {
      // Update task to in_progress
      updateTask(task.id, { status: 'in_progress', delegatedTo: 'dag-executor' });

      // Check if it's a read/write task
      const readOnly = task.metadata?.readOnly === true;
      const targetFile = task.metadata?.targetFile;
      
      let worktreeRoot = this.projectRoot;
      let sandbox: GitWorktreeSandbox | null = null;
      
      if (!readOnly && targetFile) {
        // Creative Feature: Spawn in isolated Git worktree!
        sandbox = new GitWorktreeSandbox(this.projectRoot, task.id);
        worktreeRoot = await sandbox.setup();
      }

      // Invoke the subagent using the manager
      const child = this.subagentManager.start({
        parentRunId: 'dag-orchestrator',
        parentConversationId: task.conversationId || 'global',
        taskId: task.id,
        task: task.description || task.title,
        role: task.assignedTo || 'Autonomous Executor',
        projectRoot: worktreeRoot, // Give it the isolated worktree
        targetFile: targetFile,
        readOnly: readOnly,
      }, new AbortController().signal); // Optional: Link abort signal if daemon is stopped

      updateTask(task.id, { delegatedTo: child.handle.childId });

      // Wait for it to complete
      const outcome = await child.outcome;
      
      let diff = '';
      if (sandbox) {
        const result = await sandbox.teardownAndGenerateDiff();
        diff = result.diff;
        if (result.success) {
           console.log(`[DagExecutor] Worktree teardown complete. Diff generated for PR.`);
        }
      }

      // Determine final status
      const evidenceValid = outcome.status === 'completed';
      const finalStatus = outcome.status === 'cancelled' ? 'cancelled' : evidenceValid ? 'completed' : 'failed';
      
      // We could trigger a PR-like UI update here by saving diff to metadata
      updateTask(task.id, {
        status: finalStatus,
        metadata: { 
          ...(getTask(task.id)?.metadata || {}), 
          subagentOutcome: outcome, 
          error: outcome.status === 'completed' ? undefined : outcome.summary,
          prDiff: diff
        },
      });

      // Remove from active tasks so we don't spawn it again
      this.activeTasks.delete(task.id);
      console.log(`[DagExecutor] Task ${task.id} finished with status ${finalStatus}`);
      
    } catch (e: any) {
      console.error(`[DagExecutor] Error spawning task ${task.id}:`, e);
      updateTask(task.id, { status: 'failed', metadata: { error: e.message } });
      this.activeTasks.delete(task.id);
    }
  }
}

// Singleton instance
let globalDagExecutor: DagExecutor | null = null;

export function initDagExecutor(subagentManager: SubagentManager, projectRoot: string) {
  if (!globalDagExecutor) {
    globalDagExecutor = new DagExecutor(subagentManager, projectRoot);
    globalDagExecutor.start();
  }
  return globalDagExecutor;
}

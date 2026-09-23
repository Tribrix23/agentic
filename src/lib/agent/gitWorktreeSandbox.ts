export interface SandboxResult {
  diff: string;
  success: boolean;
  worktreePath: string;
}

export class GitWorktreeSandbox {
  private projectRoot: string;
  private taskId: string;
  private worktreePath: string;
  private branchName: string;

  constructor(projectRoot: string, taskId: string) {
    this.projectRoot = projectRoot;
    this.taskId = taskId;
    
    // Sanitize task ID for branch/path names
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9-]/g, '_');
    this.branchName = `quantix-task-${safeTaskId}`;
    
    // Create an invisible worktree in .quantix directory
    const dotQuantix = `${this.projectRoot}/.quantix`;
    this.worktreePath = `${dotQuantix}/worktrees/${this.branchName}`;
  }

  private async exec(cmd: string, cwd: string): Promise<string> {
    const res = await (window as any).electron.runCommandCapture(cmd, cwd);
    if (!res.success) throw new Error(res.output);
    return res.output;
  }

  public async setup(): Promise<string> {
    try {
      const exists = await (window as any).electron.fileExists(this.worktreePath, this.projectRoot);
      if (exists) return this.worktreePath;

      // Ensure .quantix/worktrees exists
      await this.exec(`mkdir -p "${this.projectRoot}/.quantix/worktrees"`, this.projectRoot).catch(() => {});

      // Ensure we are in a git repository
      await this.exec('git rev-parse --is-inside-work-tree', this.projectRoot);
      
      // Create a new branch from current HEAD
      try {
        await this.exec(`git worktree add -b ${this.branchName} "${this.worktreePath}"`, this.projectRoot);
      } catch (err: any) {
        // If branch already exists (rare but possible), just add worktree to it
        if (err.message?.includes('already exists')) {
          await this.exec(`git worktree add "${this.worktreePath}" ${this.branchName}`, this.projectRoot);
        } else {
          throw err;
        }
      }
      
      console.log(`[GitWorktreeSandbox] Created isolated sandbox at ${this.worktreePath}`);
      return this.worktreePath;
    } catch (e: any) {
      console.warn(`[GitWorktreeSandbox] Failed to setup worktree, falling back to main repo. Error: ${e.message}`);
      // Fallback: If not a git repo, return project root
      return this.projectRoot;
    }
  }

  public getWorktreePath(): string {
    return this.worktreePath;
  }

  public async teardownAndGenerateDiff(): Promise<SandboxResult> {
    // If we fell back to projectRoot (no git), we can't generate a clean diff or tear down
    if (this.worktreePath === this.projectRoot) {
      return { diff: '', success: true, worktreePath: this.projectRoot };
    }

    try {
      // Stage all changes in the worktree
      await this.exec('git add -A', this.worktreePath);
      
      // Get the diff against the original branch (which was HEAD when we branched)
      // We use HEAD of the main repo as the base
      const baseHash = (await this.exec('git rev-parse HEAD', this.projectRoot)).trim();
      const diff = await this.exec(`git diff ${baseHash} HEAD`, this.worktreePath);

      // Commit the changes to the branch (so they aren't lost)
      await this.exec('git commit -m "Automated changes from subagent" --allow-empty', this.worktreePath);

      // Clean up the worktree (prune it)
      await this.exec('git worktree remove -f .', this.worktreePath);
      
      return { diff, success: true, worktreePath: this.worktreePath };
    } catch (e: any) {
      console.error(`[GitWorktreeSandbox] Failed to teardown and diff: ${e.message}`);
      return { diff: '', success: false, worktreePath: this.worktreePath };
    }
  }

  public async mergeToMain(): Promise<boolean> {
    if (this.worktreePath === this.projectRoot) return true;
    
    try {
      // Merge the branch into the main worktree
      await this.exec(`git merge --squash ${this.branchName}`, this.projectRoot);
      await this.exec(`git commit -m "Merged subagent changes for task ${this.taskId}"`, this.projectRoot);
      // Delete the branch now that it's merged
      await this.exec(`git branch -D ${this.branchName}`, this.projectRoot);
      return true;
    } catch (e: any) {
      console.error(`[GitWorktreeSandbox] Merge failed: ${e.message}`);
      return false;
    }
  }
}

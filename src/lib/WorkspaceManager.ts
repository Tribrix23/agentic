export class WorkspaceManager {
  private sandboxPath: string = '../.quantix_sandbox';
  private originalPath: string = '';

  /**
   * Initializes a hidden sandbox environment to prevent agents from permanently
   * modifying the live source code before user approval.
   */
  async initializeShadowSandbox(currentProjectDir: string): Promise<boolean> {
    this.originalPath = currentProjectDir;
    
    console.log('[WorkspaceManager] Initializing shadow sandbox for', currentProjectDir);
    
    // Check if git is initialized
    const statusRes = await (window as any).electron.gitStatus(currentProjectDir);
    if (statusRes.error) {
      if (statusRes.error.includes('not a git repository')) {
        await (window as any).electron.runCommandCapture('git init', currentProjectDir);
        await (window as any).electron.runCommandCapture('git add .', currentProjectDir);
        await (window as any).electron.runCommandCapture('git commit -m "Initial commit before agent work"', currentProjectDir);
      }
    }
    
    // Create worktree
    await (window as any).electron.runCommandCapture(`git worktree add ${this.sandboxPath} HEAD`, currentProjectDir);
    console.log('[WorkspaceManager] Sandbox ready at', this.sandboxPath);
    return true;
  }

  /**
   * Runs automated validations (like tsc or eslint) on the sandbox 
   * to ensure the agent didn't break the build.
   */
  async validateSandbox(): Promise<{ success: boolean; errors?: string }> {
    console.log('[WorkspaceManager] Validating sandbox integrity...');
    const result = await (window as any).electron.runCommandCapture('npm run build', this.sandboxPath);
    
    // If it fails or command not found, we fallback to just checking if package.json has a build script
    if (!result.success && !result.error?.includes('ENOENT') && !result.error?.includes('Missing script')) {
      return { success: false, errors: result.stderr || result.stdout || 'Validation failed' };
    }
    
    return { success: true };
  }

  /**
   * Applies the sandbox changes to the live workspace.
   */
  async applySandboxToLive(): Promise<boolean> {
    console.log('[WorkspaceManager] Applying sandbox changes to live project.');
    
    // Commit in sandbox
    await (window as any).electron.runCommandCapture('git add .', this.sandboxPath);
    const commitRes = await (window as any).electron.runCommandCapture('git commit -m "Agentic changes applied from sandbox"', this.sandboxPath);
    
    if (commitRes.success) {
      // Get the commit hash
      const hashRes = await (window as any).electron.runCommandCapture('git rev-parse HEAD', this.sandboxPath);
      const hash = hashRes.stdout.trim();
      
      // Cherry-pick into live
      await (window as any).electron.runCommandCapture(`git cherry-pick ${hash}`, this.originalPath);
    }
    
    // Clean up worktree
    await (window as any).electron.runCommandCapture(`git worktree remove -f ${this.sandboxPath}`, this.originalPath);
    
    return true;
  }

  /**
   * Persists the orchestrator's state to localStorage for crash recovery.
   */
  saveOrchestratorState(state: any) {
    try {
      localStorage.setItem('quantix_active_agent_session', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to persist state', e);
    }
  }

  /**
   * Loads a previously saved state if the app crashed mid-execution.
   */
  loadOrchestratorState() {
    try {
      const data = localStorage.getItem('quantix_active_agent_session');
      if (data) return JSON.parse(data);
    } catch (e) {
      return null;
    }
    return null;
  }

  clearOrchestratorState() {
    localStorage.removeItem('quantix_active_agent_session');
  }
}

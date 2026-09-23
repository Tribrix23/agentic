import { getAIConfig } from '../aiConfig';
import { SubagentManager } from './subagentManager';

export interface VerificationResult {
  success: boolean;
  linterOutput: string;
  typecheckOutput: string;
}

export class SelfHealingLoop {
  private subagentManager?: SubagentManager;

  constructor(subagentManager?: SubagentManager) {
    this.subagentManager = subagentManager;
  }

  private async exec(cmd: string, cwd: string): Promise<string> {
    const res = await (window as any).electron.runCommandCapture(cmd, cwd);
    return res.output; // ignoring success flag to return output anyway
  }

  /**
   * Run project linters and type-checkers.
   * Returns true if the codebase is clean, false if errors are found.
   */
  public async verifyProjectState(projectRoot: string): Promise<VerificationResult> {
    console.log('[SelfHealingLoop] Starting autonomous verification...');
    
    // Check if package.json has lint/typecheck scripts
    const hasLint = await (window as any).electron.runCommandCapture(`grep '"lint":' package.json`, projectRoot);
    const hasTypecheck = await (window as any).electron.runCommandCapture(`grep '"typecheck":' package.json`, projectRoot);
    
    let linterOutput = '';
    let typecheckOutput = '';
    let success = true;

    if (hasLint.success) {
      const lintRes = await (window as any).electron.runCommandCapture('npm run lint', projectRoot);
      if (!lintRes.success) {
        linterOutput = lintRes.output;
        success = false;
      }
    }

    if (hasTypecheck.success) {
      const tcRes = await (window as any).electron.runCommandCapture('npm run typecheck', projectRoot);
      if (!tcRes.success) {
        typecheckOutput = tcRes.output;
        success = false;
      }
    } else {
      // Fallback: if it's a TS project, just run tsc --noEmit directly
      const isTs = await (window as any).electron.fileExists('tsconfig.json', projectRoot);
      if (isTs) {
        const tscRes = await (window as any).electron.runCommandCapture('npx tsc --noEmit', projectRoot);
        if (!tscRes.success) {
          typecheckOutput = tscRes.output;
          success = false;
        }
      }
    }

    return { success, linterOutput, typecheckOutput };
  }

  /**
   * If verification fails, automatically spawn a debugger subagent to fix it.
   */
  public async heal(projectRoot: string, verificationData: VerificationResult, conversationId: string): Promise<boolean> {
    if (!this.subagentManager) {
      console.warn('[SelfHealingLoop] No subagent manager provided. Cannot heal autonomously.');
      return false;
    }

    console.log('[SelfHealingLoop] Verification failed. Spawning Debugger Subagent...');
    
    const taskPrompt = `
Autonomous Verification Failed. Please fix the following errors in the codebase:

Linter Errors:
${verificationData.linterOutput.substring(0, 2000)}

Type Errors:
${verificationData.typecheckOutput.substring(0, 2000)}

Use the code intelligence tools to find where these errors are, and apply fixes to satisfy the linters.
`.trim();

    const child = this.subagentManager.start({
      parentRunId: 'self-healing-loop',
      parentConversationId: conversationId,
      taskId: `heal-${Date.now()}`,
      task: taskPrompt,
      role: 'Debugger Subagent',
      projectRoot,
    });

    const outcome = await child.outcome;
    console.log(`[SelfHealingLoop] Debugger finished with status: ${outcome.status}`);
    
    // Validate again after healing
    const newVerification = await this.verifyProjectState(projectRoot);
    return newVerification.success;
  }
}

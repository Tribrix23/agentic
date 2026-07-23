import pLimit from 'p-limit';
import { SubagentTask, AgentState } from './types/AgentTypes';
import { WorkspaceManager } from './WorkspaceManager';
import { callDispatcherAPI } from '../api';

export class AgentOrchestrator {
  // STRICT REQUIREMENT: Max 3 active subagents at any given time.
  private limit = pLimit(3); 
  private workspace = new WorkspaceManager();

  /**
   * Executes the parsed implementation plan by dispatching parallel subagents
   * bounded by the p-limit concurrency cap.
   */
  async executeApprovedPlan(tasks: SubagentTask[], updateUIState: (state: AgentState) => void) {
    updateUIState('spawning_subagents');
    
    // Sandbox: Create a hidden .quantix_sandbox git worktree before any execution begins
    await this.workspace.initializeShadowSandbox('./');
    
    // Save state for crash recovery
    this.workspace.saveOrchestratorState({ tasks, status: 'running' });

    // Map tasks into the p-limit queue
    const executionPromises = tasks.map(task => 
      this.limit(() => this.executeSubagentWithRetries(task, updateUIState))
    );
    
    // Wait for all capped subagents to complete
    updateUIState('executing_parallel');
    const results = await Promise.all(executionPromises);
    
    // Validation: Automatically run linters on the shadow workspace
    const validationResult = await this.workspace.validateSandbox();
    if (!validationResult.success) {
        updateUIState('error');
        throw new Error(`Sandbox validation failed: ${validationResult.errors}`);
    }

    // Success
    this.workspace.clearOrchestratorState();
    updateUIState('synthesizing');
    return results;
  }

  /**
   * Spawns an isolated LLM API call for a specific task, managing its error budget.
   */
  private async executeSubagentWithRetries(task: SubagentTask, updateUIState: (state: AgentState) => void) {
    let attempts = 0;
    const maxRetries = task.maxRetries || 3; // Enforce Error Budget
    
    while (attempts < maxRetries) {
      try {
        return await new Promise((resolve, reject) => {
          let fullResponse = '';
          callDispatcherAPI({
            config: {
              model: 'Dispatcher v2',
              mode: 'local',
              dynamicParameters: true,
              // Dynamic Parameter: ZERO temperature for precise, non-hallucinated execution
              temperature: 0.0,
              topP: 0.1,
              topK: 40,
              maxTokens: 4096,
              frequencyPenalty: 0,
              presencePenalty: 0,
              stream: true,
              streamChunkDelay: 0,
              stopSequences: [],
              systemPrompt: `You are an expert ${task.role} subagent. Execute this instruction: ${task.instruction}`,
              useDefaultSystemPrompt: false,
              contextWindowSize: 128000,
              maxConversationTurns: 10,
              responseFormat: 'text',
              agentMode: true,
              maxAgentIterations: 15,
              autoApproveReads: true,
              autoApproveWrites: false, // Force security interceptor to handle writes
              requireApprovalForTerminal: true,
              maxRetries: 3,
              retryDelay: 1000,
              timeoutMs: 120000,
            },
            messages: [{ role: 'user', content: task.instruction }],
            onChunk: (chunk) => { fullResponse += chunk; },
            onSuccess: (text) => { resolve(text); },
            onError: (err: any) => { reject(err); },
            checkIsStreaming: () => true
          });
        });
      } catch (error) {
        attempts++;
        console.warn(`[AgentOrchestrator] Task ${task.id} failed attempt ${attempts}/${maxRetries}. Retrying...`);
        if (attempts >= maxRetries) {
          // ERROR BUDGET EXHAUSTED
          updateUIState('error');
          throw new Error(`Subagent task ${task.id} failed after ${maxRetries} attempts. Escalating to user.`);
        }
      }
    }
  }
}

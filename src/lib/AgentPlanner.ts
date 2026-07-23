import { callDispatcherAPI } from '../api';
import { PlanningContext } from './types/AgentTypes';

export class AgentPlanner {
  
  /**
   * Generates a detailed implementation plan by calling the LLM API.
   * Utilizes dynamic configuration (e.g., higher temperature) for creativity.
   */
  async createImplementationPlan(context: PlanningContext, onChunk: (chunk: string) => void): Promise<string> {
    const systemPrompt = `
      You are QUANTIX PLANNER, a senior staff software engineer.
      You are currently in PLANNING MODE. You are FORBIDDEN from writing raw source code or executing terminal commands.
      
      YOUR GOAL: Analyze the user's request and write a highly detailed markdown file named 'implementation_plan.md'.
      
      REQUIREMENTS:
      1. Break the user's request down into highly discrete, independent sub-tasks.
      2. These tasks must be capable of running in PARALLEL.
      3. Output a JSON block at the end of the markdown wrapped in \`\`\`json containing the SubagentTask schema array.
    `;

    return new Promise((resolve, reject) => {
      let fullResponse = '';

      callDispatcherAPI({
        config: {
          // Merge defaults with our dynamic overrides for planning
          model: 'Dispatcher v2',
          mode: 'local',
          dynamicParameters: true,
          temperature: context.dynamicConfig.temperature,
          topP: context.dynamicConfig.topP,
          topK: 40,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stream: true,
          streamChunkDelay: 0,
          stopSequences: [],
          systemPrompt: systemPrompt,
          useDefaultSystemPrompt: false,
          contextWindowSize: 128000,
          maxConversationTurns: 50,
          responseFormat: 'text',
          agentMode: true,
          maxAgentIterations: 1, // Planner shouldn't loop tools
          autoApproveReads: true,
          autoApproveWrites: false,
          requireApprovalForTerminal: true,
          maxRetries: 3,
          retryDelay: 1000,
          timeoutMs: 120000,
        },
        messages: [{ role: 'user', content: context.userPrompt }],
        onChunk: (chunk) => {
          fullResponse += chunk;
          onChunk(chunk);
        },
        onSuccess: (text) => {
          resolve(text);
        },
        onError: (err: any) => {
          reject(err);
        },
        checkIsStreaming: () => true
      });
    });
  }
}

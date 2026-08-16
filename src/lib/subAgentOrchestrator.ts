// ============================================================================
// Sub-Agent Orchestrator — Manages isolated agent contexts and messaging
// ============================================================================

import { AgentLoop, createAgentLoop, AgentEvent } from './agentLoop';
import { AgenticMessage, createSystemMessage, createUserMessage } from './messageTypes';
import { getAIConfig } from './aiConfig';

export interface SubAgent {
  id: string;
  role: string;
  systemPrompt: string;
  loop: AgentLoop;
  history: AgenticMessage[];
  status: 'idle' | 'running' | 'done' | 'error';
  /** The primary file this agent is responsible for writing — used to build sibling manifests. */
  targetFile?: string;
}

export class SubAgentOrchestrator {
  private parentAgent: AgentLoop;
  private subAgents: Map<string, SubAgent> = new Map();
  private eventCallback: (event: AgentEvent) => void;
  private parentConversationId: string;

  constructor(parentAgent: AgentLoop, parentConversationId: string, eventCallback: (event: AgentEvent) => void) {
    this.parentAgent = parentAgent;
    this.parentConversationId = parentConversationId;
    this.eventCallback = eventCallback;
  }

  /** Spawn a new isolated sub-agent */
  public spawnSubAgent(
    role: string,
    systemPrompt: string,
    toolDefinitions: any[],
    executor: any,
    targetFile?: string
  ): string {
    const id = `subagent_${Math.random().toString(36).substring(2, 9)}`;
    
    // Sub-agent gets its own isolated event callback to route to the main UI
    const subEventCallback = (event: AgentEvent) => {
      // Wrap event to indicate it's from a sub-agent
      this.eventCallback({
        type: event.type,
        data: { ...event.data, subAgentId: id, subAgentRole: role }
      });
    };

    const config = getAIConfig();
    // Disable default orchestration system prompt for subagents - they should be "doers", not orchestrators
    const subagentConfig = { ...config, useDefaultSystemPrompt: false };

    const loop = createAgentLoop(subEventCallback, {
      conversationId: id,
      agentRole: 'subagent',
      toolDefinitions,
      toolExecutor: executor,
    });
    loop.updateConfig(subagentConfig);

    // Build sibling-awareness manifest so this agent knows which files
    // are already claimed by concurrently-running sibling agents.
    const runningSiblings = Array.from(this.subAgents.values()).filter(
      sa => (sa.status === 'idle' || sa.status === 'running') && sa.targetFile
    );
    const siblingManifest = runningSiblings.length > 0
      ? `\n\n[SIBLING AGENTS — FILE OWNERSHIP]\nThe following sub-agents are currently running and own these files. You MUST NOT write to these paths to avoid conflicts:\n${runningSiblings.map(sa => `- ${sa.role}: ${sa.targetFile}`).join('\n')}\nYour assigned file: ${targetFile || '(none specified)'}`
      : targetFile
        ? `\n\n[YOUR ASSIGNED FILE] You are solely responsible for: ${targetFile}`
        : '';

    const history: AgenticMessage[] = [
      createSystemMessage(
        `[SUB-AGENT MODE]\nYou are a sub-agent spawned by the primary orchestrator.\nYour Role: ${role}\nInstructions: ${systemPrompt}${siblingManifest}\nWhen you are finished with your task, you MUST use the send_message tool to report your results back to the parent agent.`
      )
    ];

    this.subAgents.set(id, {
      id,
      role,
      systemPrompt,
      loop,
      history,
      status: 'idle',
      targetFile,
    });

    this.parentAgent.notifySubagentSpawned();
    return id;
  }

  /** Dispatch a message to a sub-agent (wakes it up or starts it) */
  public async sendMessageToSubAgent(subAgentId: string, message: string): Promise<boolean> {
    const subAgent = this.subAgents.get(subAgentId);
    if (!subAgent) return false;

    const msg = createUserMessage(`[Message from Parent Agent]: ${message}`);
    subAgent.history.push(msg);

    if (subAgent.status === 'idle' || subAgent.status === 'done') {
      subAgent.status = 'running';
      // Start async execution without blocking
      this.runSubAgent(subAgentId).catch(console.error);
    } else {
      // Sub-agent is already running, just add the message to its pending queue
      subAgent.loop.addPendingMessage(msg);
      subAgent.loop.wakeup();
    }

    return true;
  }

  /** Run the sub-agent loop asynchronously */
  private async runSubAgent(subAgentId: string): Promise<void> {
    const subAgent = this.subAgents.get(subAgentId);
    if (!subAgent) return;

    try {
      const newHistory = await subAgent.loop.run(subAgent.history);
      subAgent.history = newHistory;
      subAgent.status = 'done';
    } catch (e) {
      console.error(`[SubAgent ${subAgentId}] Error:`, e);
      subAgent.status = 'error';
    } finally {
      this.parentAgent.notifySubagentDone();
    }
  }

  /** Route a message from a sub-agent back to the parent */
  public sendMessageToParent(subAgentId: string, message: string): boolean {
    const subAgent = this.subAgents.get(subAgentId);
    if (!subAgent) return false;

    const formattedMessage = `[Message from Sub-Agent (${subAgent.role}, ID: ${subAgent.id})]:\n${message}`;
    
    // Wake up the parent loop with the message
    const msg = createUserMessage(formattedMessage);
    this.parentAgent.addPendingMessage(msg);
    this.parentAgent.wakeup();
    
    return true;
  }
}

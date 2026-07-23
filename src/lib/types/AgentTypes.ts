// ============================================================================
// Types & Interfaces for the Autonomous Agentic Loop
// ============================================================================

/** Represents the discrete lifecycle stages of the autonomous loop */
export type AgentState = 
  | 'idle' 
  | 'understanding'          // Triggers immediate shimmer effect
  | 'planning'               // Generates implementation plan
  | 'awaiting_plan_approval' 
  | 'spawning_subagents'     // Breaking tasks down
  | 'awaiting_tool_approval' // Halted by SecurityInterceptor
  | 'executing_parallel'     // Concurrent subagents running
  | 'synthesizing'           // Merging results
  | 'done'
  | 'error';

/** Represents a single unit of work delegated to a subagent */
export interface SubagentTask {
  id: string;
  role: 'architect' | 'coder' | 'researcher' | 'terminal_operator';
  instruction: string;       // Specific prompt for this subagent
  targetFiles?: string[];    // Files allowed to be modified
  priority: number;
  dependencies: string[];    // IDs of tasks that must complete first
  maxRetries: number;        // Error budget (default 3)
}

/** Payload sent to the LLM during planning mode */
export interface PlanningContext {
  userPrompt: string;
  projectArchitecture: string;
  currentActiveFiles: string[];
  dynamicConfig: {
    temperature: number; // e.g., 0.7 for creativity
    topP: number;        // e.g., 0.95
  };
}

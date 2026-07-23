import { useState, useCallback } from 'react';
import { AgentState } from '../lib/types/AgentTypes';

export function useAgentLoop() {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [pendingToolCall, setPendingToolCall] = useState<any>(null);

  const submitPrompt = useCallback(async (prompt: string, isAgentMode: boolean = true) => {
    // 1. INSTANT ZERO-LATENCY FEEDBACK
    // Triggers the shimmering text effect in ThinkingIndicator immediately if in agent mode
    if (isAgentMode) {
      setAgentState('understanding');
    }
    
    // 2. Here we would normally kick off the AgentPlanner 
    // Wait for plan generation, then transition to 'awaiting_plan_approval'
    
    // This hook serves as the bridge between the UI and the backend orchestrator
  }, []);

  const handleToolIntercepted = useCallback((toolCall: any) => {
    setAgentState('awaiting_tool_approval');
    setPendingToolCall(toolCall);
  }, []);

  const handleToolDecision = useCallback((isApproved: boolean) => {
    // Resume the orchestrator loop based on decision
    setAgentState('executing_parallel');
    setPendingToolCall(null);
  }, []);

  return { 
    agentState, 
    setAgentState,
    pendingToolCall, 
    submitPrompt, 
    handleToolIntercepted,
    handleToolDecision
  };
}

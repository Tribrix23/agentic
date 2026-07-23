import { useState, useCallback } from 'react';
import { AgentState } from '../lib/types/AgentTypes';

export function useAgentLoop() {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [pendingToolCall, setPendingToolCall] = useState<any>(null);

  const submitPrompt = useCallback(async (prompt: string, isAgentMode: boolean = true) => {
    if (isAgentMode) {
      setAgentState('understanding');
    }
  }, []);

  const handleToolIntercepted = useCallback((toolCall: any) => {
    setAgentState('awaiting_tool_approval');
    setPendingToolCall(toolCall);
  }, []);

  const handleToolDecision = useCallback((isApproved: boolean) => {
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

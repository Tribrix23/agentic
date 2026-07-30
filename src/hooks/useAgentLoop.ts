import { useState, useCallback, useEffect } from 'react';
import { AgentState } from '../lib/types/AgentTypes';

export function useAgentLoop() {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [pendingToolCall, setPendingToolCall] = useState<any>(null);
  const [pendingAskUser, setPendingAskUser] = useState<{ id: string; question: string; options?: string[] } | null>(null);

  const submitPrompt = useCallback(async (prompt: string, isAgentMode: boolean = true) => {
    if (isAgentMode) {
      setAgentState('understanding');
    }
  }, []);

  useEffect(() => {
    const handleAskUser = (e: any) => {
      setPendingAskUser(e.detail);
      setAgentState('awaiting_user_response');
    };
    window.addEventListener('agent-ask-user', handleAskUser);
    return () => window.removeEventListener('agent-ask-user', handleAskUser);
  }, []);

  const handleToolIntercepted = useCallback((toolCall: any) => {
    setAgentState('awaiting_tool_approval');
    setPendingToolCall(toolCall);
  }, []);

  const handleToolDecision = useCallback((isApproved: boolean, feedback?: string) => {
    if (pendingToolCall) {
      window.dispatchEvent(
        new CustomEvent('tool-approval-response', {
          detail: { toolCallId: pendingToolCall.id, approved: isApproved }
        })
      );
      
      // If rejected with feedback, we could automatically submit that feedback to the agent
      // We will handle this by returning the feedback to the caller
      if (!isApproved && feedback) {
        // Send a message as if the user typed it
        submitPrompt(`I rejected the previous tool call. Please do this instead: ${feedback}`);
      }
    }

    setAgentState('executing_parallel');
    setPendingToolCall(null);
  }, [pendingToolCall, submitPrompt]);

  const handleUserResponse = useCallback((response: string) => {
    if (pendingAskUser) {
      window.dispatchEvent(
        new CustomEvent('agent-user-response', {
          detail: { id: pendingAskUser.id, response }
        })
      );
    }
    setAgentState('executing_parallel');
    setPendingAskUser(null);
  }, [pendingAskUser]);

  return { 
    agentState, 
    setAgentState,
    pendingToolCall, 
    pendingAskUser,
    setPendingAskUser,
    submitPrompt, 
    handleToolIntercepted,
    handleToolDecision,
    handleUserResponse
  };
}

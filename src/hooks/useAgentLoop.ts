import { useState, useCallback, useEffect, useRef } from 'react';
import { AgentState } from '../lib/types/AgentTypes';
import { sendNotification } from '../lib/notification';

export function useAgentLoop(activeConversationId: string | null) {
  const [agentState, setAgentState] = useState<AgentState>('idle');
  
  const [pendingToolCalls, setPendingToolCalls] = useState<Record<string, any>>({});
  const [pendingAskUsers, setPendingAskUsers] = useState<Record<string, any>>({});

  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const pendingToolCall = activeConversationId ? (pendingToolCalls[activeConversationId] || null) : null;
  const pendingAskUser = activeConversationId ? (pendingAskUsers[activeConversationId] || null) : null;

  // When switching conversations, update agentState if we have a pending interaction
  useEffect(() => {
    if (pendingAskUser) {
      setAgentState('awaiting_user_response');
    } else if (pendingToolCall) {
      setAgentState('awaiting_tool_approval');
    }
  }, [activeConversationId, pendingAskUser, pendingToolCall]);

  const submitPrompt = useCallback(async (prompt: string, isAgentMode: boolean = true) => {
    if (isAgentMode) {
      setAgentState('understanding');
    }
  }, []);

  useEffect(() => {
    const handleAskUser = (e: any) => {
      const convId = e.detail.conversationId;
      if (!convId) return;
      
      setPendingAskUsers(prev => ({ ...prev, [convId]: e.detail }));
      
      if (convId === activeConversationIdRef.current) {
        setAgentState('awaiting_user_response');
      }
      sendNotification('Asking user', e.detail.question || 'User input needed');
    };
    window.addEventListener('agent-ask-user', handleAskUser);
    return () => window.removeEventListener('agent-ask-user', handleAskUser);
  }, []);

  const handleToolIntercepted = useCallback((toolCall: any, convId?: string) => {
    const targetId = convId || activeConversationIdRef.current;
    if (!targetId) return;
    setPendingToolCalls(prev => ({ ...prev, [targetId]: toolCall }));
    if (targetId === activeConversationIdRef.current) {
      setAgentState('awaiting_tool_approval');
    }
  }, []);

  const handleToolDecision = useCallback((isApproved: boolean, feedback?: string) => {
    const currentConvId = activeConversationIdRef.current;
    if (!currentConvId) return;
    
    const currentPendingCall = pendingToolCalls[currentConvId];

    if (currentPendingCall) {
      window.dispatchEvent(
        new CustomEvent('tool-approval-response', {
          detail: { toolCallId: currentPendingCall.id, approved: isApproved }
        })
      );
      
      if (!isApproved && feedback) {
        submitPrompt(`I rejected the previous tool call. Please do this instead: ${feedback}`);
      }
    }

    if (currentConvId === activeConversationIdRef.current) {
      setAgentState('executing_parallel');
    }
    setPendingToolCalls(prev => {
      const next = { ...prev };
      delete next[currentConvId];
      return next;
    });
  }, [pendingToolCalls, submitPrompt]);

  const handleUserResponse = useCallback((response: string) => {
    const currentConvId = activeConversationIdRef.current;
    if (!currentConvId) return;
    
    const currentAskUser = pendingAskUsers[currentConvId];

    if (currentAskUser) {
      window.dispatchEvent(
        new CustomEvent('agent-user-response', {
          detail: { id: currentAskUser.id, response }
        })
      );
    }
    if (currentConvId === activeConversationIdRef.current) {
      setAgentState('executing_parallel');
    }
    setPendingAskUsers(prev => {
      const next = { ...prev };
      delete next[currentConvId];
      return next;
    });
  }, [pendingAskUsers]);

  // Compatibility wrappers for setting state directly (used rarely if at all, but keeping interface)
  const setPendingToolCall = useCallback((val: any) => {
    const convId = activeConversationIdRef.current;
    if (!convId) return;
    setPendingToolCalls(prev => val ? { ...prev, [convId]: val } : (delete prev[convId], prev));
  }, []);
  
  const setPendingAskUser = useCallback((val: any) => {
    const convId = activeConversationIdRef.current;
    if (!convId) return;
    setPendingAskUsers(prev => val ? { ...prev, [convId]: val } : (delete prev[convId], prev));
  }, []);

  return { 
    agentState, 
    setAgentState,
    pendingToolCall, 
    setPendingToolCall,
    pendingAskUser,
    setPendingAskUser,
    submitPrompt, 
    handleToolIntercepted,
    handleToolDecision,
    handleUserResponse
  };
}

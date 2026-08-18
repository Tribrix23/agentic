import React, { useRef, useEffect } from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { MessageBubble } from './MessageBubble';
import { AgentState } from '../../lib/types/AgentTypes';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MessageThreadProps {
  messages: AgenticMessage[];
  onApproveToolCall: (id: string) => void;
  onRejectToolCall: (id: string) => void;
  agentState?: AgentState;
  agentStatus?: string;
  agentIteration?: number;
  onStopAgent?: () => void;
  onArtifactClick?: (path: string) => void;
  onUndoToMessage?: (msgId: string) => void;
}

export function MessageThread({ 
  messages, 
  onApproveToolCall, 
  onRejectToolCall,
  agentState,
  agentStatus,
  agentIteration,
  onStopAgent,
  onArtifactClick,
  onUndoToMessage
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const displayGroups: { isUser: boolean; messages: AgenticMessage[] }[] = [];
  
  for (const msg of messages) {
    // Skip internal [SYSTEM] anchor messages — these are injected for AI context only
    if (msg.role === 'user' && msg.content?.startsWith('[SYSTEM]:')) continue;
    
    // Skip messages that have been hidden (e.g. caught hallucinations and their system errors)
    if (msg.isHidden) continue;

    if (msg.role === 'assistant') {
      if (displayGroups.length === 0 || displayGroups[displayGroups.length - 1].isUser) {
        displayGroups.push({ isUser: false, messages: [msg] });
      } else {
        displayGroups[displayGroups.length - 1].messages.push(msg);
      }
    } else if (msg.role === 'tool') {
      // Attach tool result messages to the current assistant group so MessageBubble
      // can render "Ran 1 tool" steps interleaved with the thinking steps.
      if (displayGroups.length > 0 && !displayGroups[displayGroups.length - 1].isUser) {
        displayGroups[displayGroups.length - 1].messages.push(msg);
      }
    } else {
      displayGroups.push({ isUser: true, messages: [msg] });
    }
  }

  // If the agent is currently working, but all its recent messages were hidden
  // (e.g. due to intercepted hallucinations), ensure there is an empty assistant
  // group at the end so the 'Working...' accordion stays visible and doesn't flash.
  const isWorking = agentState && !['idle', 'done', 'error', 'quota_exhausted', 'awaiting_plan_approval', 'awaiting_tool_approval'].includes(agentState);
  
  if (isWorking) {
    if (displayGroups.length === 0 || displayGroups[displayGroups.length - 1].isUser) {
      displayGroups.push({ isUser: false, messages: [] });
    }
  }

  return (
    <div ref={scrollRef} className={cn("h-full overflow-y-auto p-4 pb-12 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]")}>
      <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6">
        {displayGroups.map((group, idx) => (
          <MessageBubble 
            key={group.messages[0]?.id || `working-group-${idx}`} 
            messages={group.messages} 
            allMessages={messages}
            onApproveToolCall={onApproveToolCall}
            onRejectToolCall={onRejectToolCall}
            isLatest={idx === displayGroups.length - 1}
            agentState={agentState}
            agentStatus={agentStatus}
            agentIteration={agentIteration}
            onStopAgent={onStopAgent}
            onArtifactClick={onArtifactClick}
            onUndoToMessage={onUndoToMessage}
          />
        ))}
      </div>
    </div>
  );
}

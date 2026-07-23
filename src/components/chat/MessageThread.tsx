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
}

export function MessageThread({ 
  messages, 
  onApproveToolCall, 
  onRejectToolCall,
  agentState,
  agentStatus,
  agentIteration,
  onStopAgent
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

  return (
    <div ref={scrollRef} className={cn("h-full overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]")}>
      {displayGroups.map((group, idx) => (
        <MessageBubble 
          key={group.messages[0].id} 
          messages={group.messages} 
          onApproveToolCall={onApproveToolCall}
          onRejectToolCall={onRejectToolCall}
          isLatest={idx === displayGroups.length - 1}
          agentState={agentState}
          agentStatus={agentStatus}
          agentIteration={agentIteration}
          onStopAgent={onStopAgent}
        />
      ))}
    </div>
  );
}

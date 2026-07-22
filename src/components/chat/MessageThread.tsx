import React, { useRef, useEffect } from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { MessageBubble } from './MessageBubble';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MessageThreadProps {
  messages: AgenticMessage[];
  onApproveToolCall: (id: string) => void;
  onRejectToolCall: (id: string) => void;
}

export function MessageThread({ messages, onApproveToolCall, onRejectToolCall }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const displayMessages = messages.filter(m => m.role !== 'tool');

  return (
    <div ref={scrollRef} className={cn("h-full overflow-y-auto p-4 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]")}>
      {displayMessages.map((msg) => (
        <MessageBubble 
          key={msg.id} 
          message={msg} 
          onApproveToolCall={onApproveToolCall}
          onRejectToolCall={onRejectToolCall}
        />
      ))}
    </div>
  );
}

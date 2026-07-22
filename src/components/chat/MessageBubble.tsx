import React from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Undo2 } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MessageBubbleProps {
  message: AgenticMessage;
  onApproveToolCall: (id: string) => void;
  onRejectToolCall: (id: string) => void;
}

export function MessageBubble({ message, onApproveToolCall, onRejectToolCall }: MessageBubbleProps) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>

        <div className={cn(
          "flex flex-col gap-2 relative group",
          isUser ? "items-end" : "items-start"
        )}>

          
          {message.content && (
            <div className={cn(
              "px-4 py-3 rounded-2xl",
              isUser 
                ? "bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white rounded-tr-sm" 
                : "bg-[#141419] text-white/90 rounded-tl-sm border border-white/5"
            )}>
              <MarkdownRenderer content={message.content} isStreaming={message.isStreaming} />
            </div>
          )}

          {message.toolCalls && message.toolCalls.map(tc => (
            <ToolCallCard 
              key={tc.id} 
              toolCall={tc}
              onApprove={onApproveToolCall}
              onReject={onRejectToolCall}
            />
          ))}

          <div className={cn(
            "flex items-center gap-2 text-[10px] text-white/40 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 whitespace-nowrap",
            isUser ? "right-1" : "left-1"
          )}>
            <span>{new Date(message.timestamp).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>
            <button onClick={() => navigator.clipboard.writeText(message.content || '')} className="hover:text-white transition-colors" title="Copy">
              <Copy size={11} />
            </button>
            <button className="hover:text-white transition-colors" title="Undo changes up to this point">
              <Undo2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

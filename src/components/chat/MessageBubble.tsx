import React from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Undo2 } from 'lucide-react';
import { AgentProgressCard, AgentStep } from './AgentProgressCard';
import { AgentState } from '../../lib/types/AgentTypes';
import { AgentStepsGroup } from './AgentStepsGroup';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MessageBubbleProps {
  messages: AgenticMessage[];
  onApproveToolCall: (id: string) => void;
  onRejectToolCall: (id: string) => void;
  isLatest?: boolean;
  agentState?: AgentState;
  agentStatus?: string;
  agentIteration?: number;
  onStopAgent?: () => void;
}

export function MessageBubble({ 
  messages, 
  onApproveToolCall, 
  onRejectToolCall,
  isLatest,
  agentState,
  agentStatus,
  agentIteration,
  onStopAgent
}: MessageBubbleProps) {
  if (!messages || messages.length === 0) {
    // If there are no messages (e.g. dummy group to keep Working accordion visible)
    // we still want to render the bubble if it's working.
    const isWorking = isLatest && agentState && !['idle', 'done', 'error', 'awaiting_plan_approval', 'awaiting_tool_approval'].includes(agentState);
    if (!isWorking) return null;
    
    return (
      <div className="flex w-full justify-start">
        <div className="max-w-[85%] flex gap-3 flex-row">
          <div className="flex flex-col gap-2 min-w-0 max-w-full mt-2">
            <AgentStepsGroup 
              steps={[]}
              isWorking={true}
            />
          </div>
        </div>
      </div>
    );
  }

  if (messages[0].role === 'system') {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full">
          {messages[0].content}
        </span>
      </div>
    );
  }

  const isUser = messages[0].role === 'user';
  const firstMessage = messages[0];
  const lastMessage = messages[messages.length - 1];
  
  const isWorking = !isUser && isLatest && agentState && !['idle', 'done', 'error', 'awaiting_plan_approval', 'awaiting_tool_approval'].includes(agentState);
  
  let displayContent = '';
  const steps: AgentStep[] = [];
  
  if (!isUser) {
    // Process assistant messages
    messages.forEach((msg, idx) => {
      const isLastMessage = idx === messages.length - 1;
      
      // Skip tool messages (their data is already embedded inside msg.toolCalls of the assistant message)
      if ((msg as any).role === 'tool') {
        return;
      }
      
      // Skip hidden messages (like system error corrections and their associated hallucinated replies)
      if (msg.isHidden) {
        return;
      }

      let msgContent = msg.content || '';
      
      let thinkingContent = msg.thinkingContent || '';
      let displayContentLocal = msgContent;
      
      // Fallback: if no tags, but it looks exactly like the planning template, treat all as thinking
      if (!thinkingContent && /^(?:\s*\d+\.\s+UNDERSTAND|UNDERSTAND THE REQUEST|PLAN THE APPROACH)/i.test(displayContentLocal)) {
        thinkingContent = displayContentLocal;
        displayContentLocal = '';
      }
      
      const sanitize = (text: string) => text
        .replace(/\[Called tool:[^\]]*\]/gi, '')
        .replace(/\[Result:[^\]]*\]/gi, '')
        .replace(/\[Tool Result:[^\]]*\]/gi, '')
        .replace(/\[Actions taken[^\]]*\]/gi, '')
        .replace(/^TOOL RESULT \([^)]+\):.*$/gim, '')
        .replace(/^TOOL ACTION: \w+\(.*$/gim, '')
        .replace(/^\[Actions taken in previous step\].*$/gim, '')
        .replace(/<past_action[\s\S]*?(?:<\/past_action>|$)/gi, '')
        .replace(/<past_tool_result[\s\S]*?(?:<\/past_tool_result>|$)/gi, '')
        .replace(/<\/(?:past_action|past_tool_result|arg_value|arg_key|tool_call)>/gi, '')
        .replace(/\{[\s\S]*?"tool_call"[\s\S]*?\}/gi, '')
        .replace(/<[a-zA-Z][a-zA-Z0-9_]+\s+[^>]*?\/>/gi, '')
        .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, '')
        .replace(/<\/?think(?:ing)?>/gi, '')
        .trim();

      thinkingContent = sanitize(thinkingContent);
      displayContentLocal = sanitize(displayContentLocal);

      let actualThinkingContent = thinkingContent;

      // ── Phase 2: Core Isolation Engine - Reactive Stream Wiping ───────────
      // If this message has tool calls, it is an intermediate step. 
      // We must DISCARD all conversational text outside the thinking block.
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        displayContentLocal = '';
      }

      if (actualThinkingContent) {
        steps.push({
          id: `think_${msg.id}`,
          type: 'thinking',
          status: msg.isStreaming ? 'running' : 'completed',
          content: actualThinkingContent
        });
      }

      if (displayContentLocal) {
        displayContent += (displayContent ? '\n\n' : '') + displayContentLocal;
      }
      
      // Then add tool calls AFTER thinking so they appear below the thought that triggered them
      // Add real completed tool calls from message.toolCalls
      if (msg.toolCalls) {
        msg.toolCalls.forEach(tc => {
          steps.push({
            id: tc.id,
            type: 'tool',
            status: tc.status,
            toolCall: tc,
            durationMs: tc.durationMs,
          });
        });
      }
    });
  } else {
    displayContent = messages[0].content || '';
  }

  const stepsToRender = [...steps];
  if (isWorking && steps.length === 0) {
    stepsToRender.push({
      id: 'current-thinking',
      type: 'thinking',
      status: 'running'
    });
  }

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <div className={cn(
          "flex flex-col gap-2 relative group/bubble",
          isUser ? "items-end" : "items-start"
        )}>
          {stepsToRender.length > 0 && (
            <AgentStepsGroup 
              steps={stepsToRender}
              isStreaming={lastMessage.isStreaming}
              isWorking={isWorking}
              onApproveToolCall={onApproveToolCall}
              onRejectToolCall={onRejectToolCall}
            />
          )}

          {displayContent ? (
            <div className={cn(
              "px-4 py-3 rounded-2xl",
              isUser 
                ? "bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white rounded-tr-sm" 
                : "text-white/90 mt-1"
            )}>
              <MarkdownRenderer content={displayContent} isStreaming={lastMessage.isStreaming && steps.length === 0} />
            </div>
          ) : null}



          <div className={cn(
            "flex items-center gap-2 text-[10px] text-white/40 opacity-0 group-hover/bubble:opacity-100 transition-opacity absolute -bottom-6 whitespace-nowrap",
            isUser ? "right-1" : "left-1"
          )}>
            <span>{new Date(firstMessage.timestamp).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>
            {isUser && (
              <>
                <button onClick={() => navigator.clipboard.writeText(firstMessage.content || '')} className="hover:text-white transition-colors" title="Copy">
                  <Copy size={11} />
                </button>
                <button className="hover:text-white transition-colors" title="Undo changes up to this point">
                  <Undo2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

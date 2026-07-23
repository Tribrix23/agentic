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
  
  const isWorking = !isUser && isLatest && agentState && agentState !== 'idle';
  
  let displayContent = '';
  const steps: AgentStep[] = [];
  
  if (!isUser) {
    messages.forEach((msg, idx) => {
      const isLastMessage = idx === messages.length - 1;
      
      // Tool messages are rendered as tool steps later in this loop — skip text processing
      if ((msg as any).role === 'tool') {
        const toolName = (msg as any).toolName || 'unknown';
        const content = msg.content || '';
        steps.push({
          id: msg.id,
          type: 'tool',
          status: 'completed',
          toolCall: {
            id: msg.id,
            name: toolName,
            arguments: {},
            status: 'completed',
            timestamp: msg.timestamp || Date.now(),
            result: { success: !content.startsWith('Error'), output: content },
          },
        });
        return; // Skip the rest of the forEach for this message
      }

      let msgContent = msg.content || '';
      
      // Parse thinking blocks — handle both <thinking> and <think> variants
      const thinkingRegex = /<think(?:ing)?>(([\s\S]*?)(?:<\/think(?:ing)?>|$))/gi;
      let match;
      let lastIndex = 0;
      let newContent = '';
      let thoughtCount = 0;
      
      while ((match = thinkingRegex.exec(msgContent)) !== null) {
        newContent += msgContent.slice(lastIndex, match.index);
        const isComplete = /<\/think(?:ing)?>/.test(match[0]);
        
        steps.push({
          id: `think_${msg.id}_${thoughtCount++}`,
          type: 'thinking',
          status: (isComplete || !msg.isStreaming) ? 'completed' : 'running',
          content: match[2].trim(),
        });
        lastIndex = match.index + match[0].length;
      }
      newContent += msgContent.slice(lastIndex);
      
      // Strip out <tool_call> blocks (they are shown via msg.toolCalls once executed)
      const toolCallRegex = /<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi;
      const tcIndex = (newContent.match(toolCallRegex) || []).length;
      newContent = newContent.replace(toolCallRegex, '').trim();
      
      const hasTools = (msg.toolCalls && msg.toolCalls.length > 0) || tcIndex > 0;
      
      // ── Sanitize: strip any history-format artifacts the AI may have echoed back ──
      // These formats come from contextBuilder's plain-text history injection.
      // If the AI sees them in its context and mimics them, we strip them here.
      newContent = newContent
        // Old bracket formats
        .replace(/\[Called tool:[^\]]*\]/gi, '')
        .replace(/\[Result:[^\]]*\]/gi, '')
        .replace(/\[Tool Result:[^\]]*\]/gi, '')
        .replace(/\[Actions taken[^\]]*\]/gi, '')
        // New plain-text history format echoes
        .replace(/^TOOL RESULT \([^)]+\):.*$/gim, '')
        .replace(/^TOOL ACTION: \w+\(.*$/gim, '')
        .replace(/^\[Actions taken in previous step\].*$/gim, '')
        // XML past_action / past_tool_result — match even if malformed/unclosed
        .replace(/<past_action[\s\S]*?(?:<\/past_action>|$)/gi, '')
        .replace(/<past_tool_result[\s\S]*?(?:<\/past_tool_result>|$)/gi, '')
        // Orphaned closing XML tags
        .replace(/<\/(?:past_action|past_tool_result|arg_value|arg_key|tool_call)>/gi, '')
        // Strip raw JSON tool call objects that weren't fully parsed
        .replace(/\{[\s\S]*?"tool_call"[\s\S]*?\}/gi, '')
        // Strip self-closing XML tool calls e.g. <listDirectory path="..." />
        .replace(/<[a-zA-Z][a-zA-Z0-9_]+\s+[^>]*?\/>/gi, '')
        // Strip think blocks and orphaned think tags
        .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '')
        .replace(/<\/?think(?:ing)?>/gi, '')
        .trim();

      // Push the thinking/plan text FIRST (before tool calls) so it always appears above them
      if (newContent) {
        if (!isLastMessage || hasTools || isWorking) {
          steps.push({
            id: `plan_${msg.id}`,
            type: 'thinking',
            status: msg.isStreaming ? 'running' : 'completed',
            content: newContent
          });
        } else {
          displayContent = newContent;
        }
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
          "flex flex-col gap-2 relative group",
          isUser ? "items-end" : "items-start"
        )}>
          {stepsToRender.length > 0 && (
            <AgentStepsGroup 
              steps={stepsToRender}
              isStreaming={lastMessage.isStreaming}
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
          ) : !isWorking && stepsToRender.length > 0 && !isUser ? (
            // Fallback: tools ran but no final summary was generated (e.g. all tools errored)
            // Show which tools ran and their status so the user knows what happened
            <div className="text-white/50 text-sm mt-1 italic">
              {stepsToRender.filter(s => s.type === 'tool').every(s => s.status === 'error' || s.toolCall?.status === 'error')
                ? 'All tools encountered errors. Check the results above for details.'
                : 'Done.'}
            </div>
          ) : null}



          <div className={cn(
            "flex items-center gap-2 text-[10px] text-white/40 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6 whitespace-nowrap",
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

import React from 'react';
import { AgenticMessage, ToolCall, FileAttachment } from '../../lib/messageTypes';
import { AIConfig } from '../../lib/aiConfig';
import { TokenBudget } from '../../lib/tokenCounter';
import { MessageThread } from './MessageThread';
import { AgentStatusBar } from './AgentStatusBar';
import { PromptInput } from './PromptInput';
import { ThinkingIndicator } from './ThinkingIndicator';
import { AgentState } from '../../lib/types/AgentTypes';
import { ToolApprovalCard } from './ToolApprovalCard';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface ChatContainerProps {
  messages: AgenticMessage[];
  onSendMessage: (content: string, attachments?: FileAttachment[], mentionedFiles?: string[]) => void;
  onApproveToolCall: (toolCallId: string) => void;
  onRejectToolCall: (toolCallId: string) => void;
  onStopAgent: () => void;
  isAgentRunning: boolean;
  agentStatus?: string;
  agentIteration?: number;
  agentState?: AgentState;
  tokenBudget?: TokenBudget;
  config: AIConfig;
  projectFiles?: any[];
  projectSelector?: React.ReactNode;
  onConfigChange?: (partial: Partial<AIConfig>) => void;
  pendingToolCall?: any;
  onToolDecision?: (approved: boolean, feedback?: string) => void;
}

export function ChatContainer({
  messages,
  onSendMessage,
  onApproveToolCall,
  onRejectToolCall,
  onStopAgent,
  isAgentRunning,
  agentStatus,
  agentIteration,
  agentState = 'idle',
  tokenBudget,
  config,
  projectFiles,
  projectSelector,
  onConfigChange,
  onArtifactClick,
  pendingToolCall,
  onToolDecision
}: ChatContainerProps & { onArtifactClick?: (path: string) => void }) {
  return (
    <div className={cn("flex flex-col h-full bg-transparent text-white")}>
      <div className="flex-1 overflow-hidden relative">
        <MessageThread 
          messages={messages}
          onApproveToolCall={onApproveToolCall}
          onRejectToolCall={onRejectToolCall}
          agentState={agentState}
          agentStatus={agentStatus}
          agentIteration={agentIteration}
          onStopAgent={onStopAgent}
          onArtifactClick={onArtifactClick}
        />
      </div>
      <div className="px-4 pb-4 bg-transparent w-full">
        <div className="w-full max-w-[700px] mx-auto flex flex-col items-center">
          {projectSelector}
          
          <div className="w-full flex flex-col items-center gap-2">
            {agentState === 'awaiting_tool_approval' && pendingToolCall && onToolDecision ? (
              <ToolApprovalCard 
                toolCall={pendingToolCall} 
                onDecision={onToolDecision}
                onSkip={() => onToolDecision(false)}
              />
            ) : (
              <PromptInput 
                onSend={onSendMessage}
                onStop={onStopAgent}
                isAgentRunning={isAgentRunning}
                config={config}
                projectFiles={projectFiles}
                onConfigChange={onConfigChange}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

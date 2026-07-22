import React from 'react';
import { AgenticMessage, ToolCall, FileAttachment } from '../../lib/messageTypes';
import { AIConfig } from '../../lib/aiConfig';
import { TokenBudget } from '../../lib/tokenCounter';
import { MessageThread } from './MessageThread';
import { AgentStatusBar } from './AgentStatusBar';
import { PromptInput } from './PromptInput';

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
  tokenBudget?: TokenBudget;
  config: AIConfig;
  projectFiles?: any[];
  projectSelector?: React.ReactNode;
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
  tokenBudget,
  config,
  projectFiles,
  projectSelector
}: ChatContainerProps) {
  return (
    <div className={cn("flex flex-col h-full bg-transparent text-white")}>
      <div className="flex-1 overflow-hidden relative">
        <MessageThread 
          messages={messages}
          onApproveToolCall={onApproveToolCall}
          onRejectToolCall={onRejectToolCall}
        />
      </div>
      <div className="px-4 pb-4 bg-transparent w-full">
        <div className="w-full max-w-[700px] mx-auto flex flex-col items-center">
          {projectSelector}
          <div className="w-full">
            <PromptInput 
              onSend={onSendMessage}
              onStop={onStopAgent}
              isAgentRunning={isAgentRunning}
              config={config}
              projectFiles={projectFiles}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

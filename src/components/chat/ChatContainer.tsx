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
import { AskUserCard } from './AskUserCard';
import { Square } from 'lucide-react';

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
  onUndoToMessage?: (msgId: string) => void;
  pendingAskUser?: { id: string; question: string; options?: string[] } | null;
  onUserResponse?: (response: string) => void;
  inputValue?: string;
  onInputChange?: (val: string) => void;
  userId?: string;
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
  onToolDecision,
  onUndoToMessage,
  pendingAskUser,
  onUserResponse,
  inputValue,
  onInputChange,
  userId
}: ChatContainerProps & { onArtifactClick?: (path: string) => void }) {
  return (
    <div className={cn("relative flex flex-col h-full bg-transparent text-white")}>
      {isAgentRunning && (
        <button
          type="button"
          onClick={onStopAgent}
          className="absolute bottom-5 right-5 z-[120] flex h-10 w-10 items-center justify-center rounded-full border border-red-300/30 bg-red-500 text-white shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-300/70"
          title="Stop agent"
          aria-label="Stop agent"
        >
          <Square size={15} fill="currentColor" />
        </button>
      )}
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
          onUndoToMessage={onUndoToMessage}
        />
      </div>
      <div className="px-4 pb-4 bg-transparent w-full">
        <div className="w-full max-w-[900px] mx-auto flex flex-col items-center">
          {projectSelector}
          
          <div className="w-full flex flex-col items-center gap-2">
            {agentState === 'awaiting_tool_approval' && pendingToolCall && onToolDecision ? (
              <ToolApprovalCard 
                toolCall={pendingToolCall} 
                onDecision={onToolDecision}
                onSkip={() => onToolDecision(false)}
              />
            ) : agentState === 'awaiting_user_response' && pendingAskUser && onUserResponse ? (
              <AskUserCard
                question={pendingAskUser.question}
                options={pendingAskUser.options}
                onSubmit={onUserResponse}
              />
            ) : (
              <PromptInput 
                onSend={onSendMessage}
                onStop={onStopAgent}
                isAgentRunning={isAgentRunning}
                config={config}
                projectFiles={projectFiles}
                onConfigChange={onConfigChange}
                value={inputValue}
                onChange={onInputChange}
                userId={userId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

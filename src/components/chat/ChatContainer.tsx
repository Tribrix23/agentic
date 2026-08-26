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
import { QuotaExhaustedNotice } from './QuotaExhaustedNotice';
import { isAgentRunActive } from '../../lib/agentPresentation';

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
  onUndoToMessage?: (msgId: string) => Promise<boolean> | boolean;
  conversationId?: string | null;
  pendingAskUser?: { id: string; question: string; options?: string[] } | null;
  onUserResponse?: (response: string) => void;
  inputValue?: string;
  onInputChange?: (val: string) => void;
  userId?: string;
  quotaExhaustedMessage?: string | null;
  onDismissQuota?: () => void;
  onSelectAnotherModel?: () => void;
  onUpgradePlan?: () => void;
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
  conversationId,
  pendingAskUser,
  onUserResponse,
  inputValue,
  onInputChange,
  userId,
  quotaExhaustedMessage,
  onDismissQuota,
  onSelectAnotherModel,
  onUpgradePlan
}: ChatContainerProps & { onArtifactClick?: (path: string) => void }) {
  const isRunActive = isAgentRunActive(isAgentRunning, agentState);

  return (
    <div className={cn("relative flex flex-col h-full bg-transparent text-white")}>
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
          conversationId={conversationId}
        />
      </div>
      <div className="px-4 pb-4 bg-transparent w-full">
        <div className="w-full max-w-[900px] mx-auto flex flex-col items-center">
          {projectSelector}
          {quotaExhaustedMessage && onDismissQuota && onSelectAnotherModel && onUpgradePlan && (
            <div className="mb-2 flex w-full justify-center">
              <QuotaExhaustedNotice
                message={quotaExhaustedMessage}
                onDismiss={onDismissQuota}
                onSelectModel={onSelectAnotherModel}
                onUpgrade={onUpgradePlan}
              />
            </div>
          )}

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
            ) : null}
            <PromptInput
              onSend={onSendMessage}
              onStop={onStopAgent}
              isAgentRunning={isRunActive}
              config={config}
              projectFiles={projectFiles}
              onConfigChange={onConfigChange}
              value={inputValue}
              onChange={onInputChange}
              userId={userId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

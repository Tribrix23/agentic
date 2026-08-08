import React, { useState } from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Undo2, ChevronRight, ChevronDown, FileCode } from 'lucide-react';
import { AgentProgressCard, AgentStep } from './AgentProgressCard';
import { AgentStepsGroup } from './AgentStepsGroup';
import { UndoConfirmModal, UndoFileChange } from './UndoConfirmModal';
import { getSnapshot, getSnapshotsFrom } from '../../lib/snapshotStore';
import { FileIcon } from './FileIcon';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface MessageBubbleProps {
  messages: AgenticMessage[];
  onApproveToolCall: (id: string) => void;
  onRejectToolCall: (id: string) => void;
  isLatest?: boolean;
  agentState?: string;
  agentStatus?: string;
  agentIteration?: number;
  onStopAgent?: () => void;
  onArtifactClick?: (path: string) => void;
  // All messages in the thread so undo can look at subsequent assistant messages
  allMessages?: AgenticMessage[];
  onUndoToMessage?: (msgId: string) => void;
}

export function MessageBubble({ 
  messages, 
  onApproveToolCall, 
  onRejectToolCall,
  isLatest,
  agentState,
  agentStatus,
  agentIteration,
  onStopAgent,
  onArtifactClick,
  allMessages,
  onUndoToMessage
}: MessageBubbleProps) {
  const [showUndoModal, setShowUndoModal] = useState(false);
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
        .replace(/```(?:json)?\s*\{[\s\S]*?"tool_call"[\s\S]*?\}\s*```/gi, '')
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

  // --- Aggregate File Changes ---
  const fileChangesMap = new Map<string, { path: string; added: number; removed: number; action: string; content?: string }>();
  
  if (!isUser) {
    steps.forEach(step => {
      if (step.status !== 'completed' || !step.toolCall) return;
      
      const tc = step.toolCall;
      
      // Handle subagents
      if (tc.name === 'invokeSubagent') {
        const fileActivity = (tc as any).subagentFileActivity;
        // For simplicity we might just skip subagents or if it has an array of files we could parse it,
        // but `subagentFileActivity` is just `{ added, removed }` right now in AgentProgressCard.
        // We'll skip complex subagent parsing here unless the structure contains file paths.
        return;
      }
      
      const editTools = ['editFile', 'writeFile', 'createFile', 'replace_file_content', 'multi_replace_file_content', 'write_to_file', 'run_command', 'deleteFile', 'delete_file'];
      if (!editTools.includes(tc.name)) return;
      
      const args = tc.arguments || {};
      let targetPath = args.TargetFile || args.path || args.file || args.Target || '';
      let isDelete = false;

      if (tc.name === 'run_command' && args.CommandLine) {
        const cmd = args.CommandLine.trim();
        const rmMatch = cmd.match(/^rm\s+(?:-[rRf]+\s+)?['"]?([^'"]+)['"]?$/);
        if (rmMatch) {
          targetPath = rmMatch[1];
          isDelete = true;
        } else {
          return;
        }
      } else if (['deleteFile', 'delete_file'].includes(tc.name)) {
        isDelete = true;
      }

      if (!targetPath) targetPath = 'Unknown File';
      
      let added = 0;
      let removed = 0;
      
      const artifacts = tc.result?.artifacts || [];
      const diffArtifact = artifacts.find((a: any) => a.type === 'diff' && a.diff);
      
      if (diffArtifact?.diff) {
        const lines = String(diffArtifact.diff).split('\n');
        added = lines.filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length;
        removed = lines.filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length;
      } else {
        const output = tc.result?.output || '';
        const addMatch = String(output).match(/(\d+) insertion/);
        const delMatch = String(output).match(/(\d+) deletion/);
        if (addMatch) added = parseInt(addMatch[1]);
        if (delMatch) removed = parseInt(delMatch[1]);
        
        if (['writeFile', 'createFile', 'write_to_file'].includes(tc.name)) {
          const fileContent = args.CodeContent || args.content || args.file_content || '';
          added = typeof fileContent === 'string' ? fileContent.split('\n').length : 1;
        } else if (isDelete) {
          added = 0;
          removed = 0;
        } else if (added === 0 && removed === 0) {
          added = 1; removed = 1;
        }
      }
      
      const fileContent = args.CodeContent || args.content || args.file_content || args.ReplacementContent || undefined;

      if (fileChangesMap.has(targetPath)) {
        const existing = fileChangesMap.get(targetPath)!;
        existing.added += added;
        existing.removed += removed;
        if (isDelete) existing.action = 'delete';
        if (fileContent !== undefined) existing.content = fileContent;
      } else {
        fileChangesMap.set(targetPath, {
          path: targetPath,
          added,
          removed,
          action: isDelete ? 'delete' : tc.name.includes('create') || tc.name.includes('write') ? 'create' : 'edit',
          content: fileContent
        });
      }
    });
  }

  const aggregatedFileChanges = Array.from(fileChangesMap.values());
  const totalAdded = aggregatedFileChanges.reduce((sum, f) => sum + (f.action === 'delete' ? 0 : f.added), 0);
  const totalRemoved = aggregatedFileChanges.reduce((sum, f) => sum + (f.action === 'delete' ? 0 : f.removed), 0);

  const [filesExpanded, setFilesExpanded] = useState(false);

  return (
    <div className={cn("flex w-full min-w-0 mb-2", isUser ? "justify-center" : "justify-start")}>
      <div className={cn(
        "flex gap-3 w-full min-w-0",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <div className={cn(
          "flex flex-col gap-2 relative group/bubble w-full min-w-0",
          isUser ? "items-end" : "items-start"
        )}>
          {stepsToRender.length > 0 && (
            <AgentStepsGroup 
              steps={stepsToRender}
              isStreaming={lastMessage.isStreaming}
              isWorking={isWorking}
              onApproveToolCall={onApproveToolCall}
              onRejectToolCall={onRejectToolCall}
              onArtifactClick={onArtifactClick}
            />
          )}

          {displayContent ? (
            <div className={cn(
              "px-4 py-3 rounded-2xl",
              isUser 
                ? "bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white rounded-tr-sm w-full" 
                : "text-white/90 mt-1 w-full min-w-0 break-words"
            )}>
              <MarkdownRenderer content={displayContent} isStreaming={lastMessage.isStreaming && steps.length === 0} onArtifactClick={onArtifactClick} />
            </div>
          ) : null}

          {aggregatedFileChanges.length > 0 && (
            <div className="w-full mt-2 bg-[#121214] border border-white/5 rounded-xl overflow-hidden font-sans shadow-lg">
              <div 
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setFilesExpanded(!filesExpanded)}
              >
                <div className="flex items-center gap-2 text-[13px] text-white/80">
                  {aggregatedFileChanges.length} {aggregatedFileChanges.length === 1 ? 'file' : 'files'} changed
                  <span className="text-[#4ec9b0] font-mono ml-1">+{totalAdded}</span>
                  <span className="text-[#f14c4c] font-mono">-{totalRemoved}</span>
                  {filesExpanded ? <ChevronDown size={14} className="text-white/40 ml-1" /> : <ChevronRight size={14} className="text-white/40 ml-1" />}
                </div>
                <button 
                  className="text-xs px-2.5 py-1 rounded bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors border border-white/5 flex items-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('open-right-sidebar'));
                    aggregatedFileChanges.forEach(file => {
                      window.dispatchEvent(new CustomEvent('open-sidebar-file', { detail: { path: file.path, content: (file as any).content, type: file.action } }));
                    });
                  }}
                >
                  <FileCode size={12} /> Review
                </button>
              </div>
              
              {filesExpanded && (
                <div className="border-t border-white/5 bg-[#0a0a0c] p-2 flex flex-col gap-1">
                  {aggregatedFileChanges.map((file, idx) => {
                    const fileName = file.path.split(/[/\\]/).pop() || file.path;
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('open-sidebar-file', { detail: { path: file.path, content: (file as any).content, type: file.action } }));
                          window.dispatchEvent(new CustomEvent('open-right-sidebar'));
                        }}
                        className="flex items-center justify-between px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer group transition-colors"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={cn("shrink-0", file.action === 'delete' ? "opacity-50 grayscale" : "")}>
                            <FileIcon filename={fileName} size={14} />
                          </div>
                          <span className={cn("text-[12px] truncate", file.action === 'delete' ? "text-red-400/80 line-through" : "text-white/80")}>{fileName}</span>
                          <span className="text-[10px] text-white/30 truncate hidden group-hover:block transition-opacity">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                          {file.action === 'delete' ? (
                            <span className="text-[#f14c4c]">deleted</span>
                          ) : (
                            <>
                              {file.added > 0 && <span className="text-[#4ec9b0]">+{file.added}</span>}
                              {file.removed > 0 && <span className="text-[#f14c4c]">-{file.removed}</span>}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
                <button
                  onClick={() => setShowUndoModal(true)}
                  className="hover:text-white transition-colors"
                  title="Undo changes up to this point"
                >
                  <Undo2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Undo Confirmation Modal */}
      {isUser && (() => {
        // Pull file changes from the persistent snapshot store for this and all subsequent turns
        let fileChanges: UndoFileChange[] = [];
        const initialSnapshot = getSnapshot(firstMessage.id);
        if (initialSnapshot?.conversationId) {
          const snapshots = getSnapshotsFrom(initialSnapshot.conversationId, firstMessage.id);
          snapshots.forEach(s => {
            s.files.forEach(f => {
              if (!fileChanges.find(c => c.path === f.path)) {
                fileChanges.push({ path: f.path, added: 1, removed: 1 });
              }
            });
          });
        }

        return (
          <UndoConfirmModal
            isOpen={showUndoModal}
            changes={fileChanges}
            onCancel={() => setShowUndoModal(false)}
            onConfirm={async () => {
              setShowUndoModal(false);
              // Delegate everything (file restore + UI reset) to parent
              onUndoToMessage?.(firstMessage.id);
            }}
          />
        );
      })()}
    </div>
  );
}


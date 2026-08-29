import React, { useEffect, useState } from 'react';
import { AgenticMessage } from '../../lib/messageTypes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Copy, Undo2, ChevronRight, ChevronDown, FileCode, Download, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { AgentProgressCard, AgentStep } from './AgentProgressCard';
import { AgentStepsGroup } from './AgentStepsGroup';
import { UndoConfirmModal, UndoFileChange } from './UndoConfirmModal';
import { getSnapshotForMessage, getSnapshotsFrom } from '../../lib/snapshotStore';
import { checkpointChangesToUndoChanges, legacySnapshotsToUndoChanges } from '../../lib/undoModalData';
import type { GitCheckpointManifestResult } from '../../lib/gitCheckpointTypes';
import { FileIcon } from './FileIcon';
import { getReviewArtifacts, isAgentWaiting, isAgentWorking } from '../../lib/agentPresentation';
import type { AgentState } from '../../lib/types/AgentTypes';

import { Tooltip } from "../ui/Tooltip";

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
  onArtifactClick?: (path: string) => void;
  // All messages in the thread so undo can look at subsequent assistant messages
  allMessages?: AgenticMessage[];
  conversationId?: string | null;
  onUndoToMessage?: (msgId: string) => Promise<boolean> | boolean;
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
  conversationId,
  onUndoToMessage
}: MessageBubbleProps) {
  const [showUndoModal, setShowUndoModal] = useState(false);
  const [checkpointChanges, setCheckpointChanges] = useState<UndoFileChange[] | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageCopied, setIsImageCopied] = useState(false);
  const [isTextCopied, setIsTextCopied] = useState(false);

  const firstMessage = messages[0];
  const isUser = firstMessage?.role === 'user';

  useEffect(() => {
    if (showUndoModal) setUndoError(null);
  }, [showUndoModal]);

  useEffect(() => {
    if (!showUndoModal || !isUser || !conversationId || !firstMessage) return;
    let cancelled = false;
    const snapshot = getSnapshotForMessage(conversationId, firstMessage.id);
    if (!snapshot) {
      setCheckpointChanges([]);
      return;
    }
    if (!snapshot.gitCheckpoint) {
      setCheckpointChanges(legacySnapshotsToUndoChanges(getSnapshotsFrom(conversationId, firstMessage.id)));
      return;
    }
    setCheckpointChanges(snapshot.checkpointManifest ? checkpointChangesToUndoChanges(snapshot.checkpointManifest) : null);
    (async () => {
      const result = await (window as any).electron?.getGitCheckpointManifest?.(snapshot.projectPath, snapshot.gitCheckpoint) as GitCheckpointManifestResult | undefined;
      if (cancelled || !result) return;
      if (result.success && result.changes) {
        setCheckpointChanges(checkpointChangesToUndoChanges(result.changes));
      } else if (!snapshot.checkpointManifest) {
        setCheckpointChanges([]);
      }
    })();
    return () => { cancelled = true; };
  }, [showUndoModal, isUser, conversationId, firstMessage?.id]);

  if (!messages || messages.length === 0) {
    // If there are no messages (e.g. dummy group to keep Working accordion visible)
    // we still want to render the bubble if it's working.
    const isWorking = isLatest && isAgentWorking(agentState);
    const isWaiting = isLatest && isAgentWaiting(agentState);
    if (!isWorking && !isWaiting) return null;

    return (
      <div className="flex w-full justify-start">
        <div className="max-w-[85%] flex gap-3 flex-row">
          <div className="flex flex-col gap-2 min-w-0 max-w-full mt-2">
            <AgentStepsGroup
              steps={[]}
              isWorking={isWorking}
              agentState={agentState}
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

  const lastMessage = messages[messages.length - 1];

  const isWorking = !isUser && isLatest && isAgentWorking(agentState);

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

      // Extract <think> content if it exists in the main content body
      if (!thinkingContent) {
        const thinkMatch = displayContentLocal.match(/<think(?:ing)?>([\s\S]*?)(?:<\/?think(?:ing)?>|$)/i);
        if (thinkMatch) {
          thinkingContent = thinkMatch[1];
        } else if (/^(?:\s*\d+\.\s+UNDERSTAND|UNDERSTAND THE REQUEST|PLAN THE APPROACH)/i.test(displayContentLocal)) {
          // Fallback: if no tags, but it looks exactly like the planning template, treat all as thinking
          thinkingContent = displayContentLocal;
          displayContentLocal = '';
        }
      }

      const sanitize = (text: string) => text
        .replace(/\[Called tool:[^\]]*\]/gi, '')
        .replace(/\[Result:[^\]]*\]/gi, '')
        .replace(/\[Tool Result:[^\]]*\]/gi, '')
        .replace(/\[Actions taken[^\]]*\]/gi, '')
        .replace(/^TOOL RESULT \([^)]+\):.*$/gim, '')
        .replace(/^TOOL ACTION: \w+.*$/gim, '')
        .replace(/^\[Actions taken in previous step\].*$/gim, '')
        .replace(/^\[HISTORICAL CONTEXT[^\]]*\].*$/gim, '')
        .replace(/^\[PAST_ACTION:[^\]]*\].*$/gim, '')
        .replace(/<!--[\s\S]*?-->/gi, '')
        .replace(/<system_history>[\s\S]*?<\/system_history>/gi, '')
        .replace(/<system_history_tool[^>]*>[\s\S]*?<\/system_history_tool>/gi, '')
        .replace(/<past_action[\s\S]*?(?:<\/past_action>|$)/gi, '')
        .replace(/<past_tool_result[\s\S]*?(?:<\/past_tool_result>|$)/gi, '')
        .replace(/<\/(?:past_action|past_tool_result|arg_value|arg_key|tool_call|system_history|system_history_tool)>/gi, '')
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
          content: actualThinkingContent,
          agentName: (msg as any).name?.startsWith('Subagent') ? (msg as any).name : undefined
        });
      }

      if (displayContentLocal) {
        displayContent += (displayContent ? '\n\n' : '') + displayContentLocal;
      }

      // --- LIVE STREAMING TOOL INTERCEPTOR ---
      // If the AI is streaming a tool call as raw text, we want to show the file card immediately!
      if (msg.isStreaming) {
        const rawContent = msg.content || '';
        const matchToolStr = (tName: string, str: string) => {
          // Prevent duplicates if it's already gracefully parsed into msg.toolCalls
          if (msg.toolCalls && msg.toolCalls.some(tc => tc.name === tName)) return;

          // Extract common arguments for the live stats (using a broader match for multiline strings)
          const pathMatch = str.match(/"(?:TargetFile|path|file|Target)"\s*:\s*"([^"]+)"/);
          const addMatch = str.match(/"(?:ReplacementContent|CodeContent|file_content|content)"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*\})/);
          const remMatch = str.match(/"TargetContent"\s*:\s*"([\s\S]*?)"(?:\s*,|\s*\})/);

          steps.push({
            id: `stream_tool_${msg.id}_${tName}`,
            type: 'tool',
            status: 'running',
            agentName: msg.name?.startsWith('Subagent') ? msg.name : undefined,
            toolCall: {
              id: `stream_tool_${msg.id}_${tName}`,
              name: tName,
              arguments: {
                TargetFile: pathMatch ? pathMatch[1] : 'Unknown',
                ReplacementContent: addMatch ? addMatch[1] : '',
                TargetContent: remMatch ? remMatch[1] : ''
              },
              status: 'running',
              timestamp: Date.now()
            }
          });
        };

        // Try JSON format
        const jsonRegex = /```(?:json)?\s*(\{[\s\S]*?(?:"name"|"tool_call")[\s\S]*?(?:\}\s*```)?)/gi;
        let jsonMatch;
        while ((jsonMatch = jsonRegex.exec(rawContent)) !== null) {
          const nameMatch = jsonMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch) matchToolStr(nameMatch[1], jsonMatch[1]);
        }

        // Try XML format
        const xmlRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/gi;
        let xmlMatch;
        while ((xmlMatch = xmlRegex.exec(rawContent)) !== null) {
          const nameMatch = xmlMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
          if (nameMatch) matchToolStr(nameMatch[1], xmlMatch[1]);
        }

        // Try Antigravity format: call:tool_name{...
        const antigravityRegex = /call:([a-zA-Z0-9_]+)\s*(\{[\s\S]*?(?:\}|$))/gi;
        let antigravityMatch;
        while ((antigravityMatch = antigravityRegex.exec(rawContent)) !== null) {
          matchToolStr(antigravityMatch[1], antigravityMatch[2]);
        }

        // Try Native <function=name> format (Gemini XML style)
        const functionRegex = /<function=([a-zA-Z0-9_-]+)>([\s\S]*?(?:<\/function>|$))/gi;
        let functionMatch;
        while ((functionMatch = functionRegex.exec(rawContent)) !== null) {
          const tName = functionMatch[1];
          const innerStr = functionMatch[2];

          if (!msg.toolCalls || !msg.toolCalls.some(tc => tc.name === tName)) {
            const pathMatch = innerStr.match(/<parameter=(?:TargetFile|path|file|Target)>\s*([\s\S]*?)(?:<\/parameter>|$)/i);
            const addMatch = innerStr.match(/<parameter=(?:ReplacementContent|CodeContent|file_content|content)>\s*([\s\S]*?)(?:<\/parameter>|$)/i);
            const remMatch = innerStr.match(/<parameter=TargetContent>\s*([\s\S]*?)(?:<\/parameter>|$)/i);

            steps.push({
              id: `stream_tool_${msg.id}_${tName}`,
              type: 'tool',
              status: 'running',
              agentName: (msg as any).name?.startsWith('Subagent') ? (msg as any).name : undefined,
              toolCall: {
                id: `stream_tool_${msg.id}_${tName}`,
                name: tName,
                arguments: {
                  TargetFile: pathMatch ? pathMatch[1].trim() : 'Unknown',
                  ReplacementContent: addMatch ? addMatch[1] : '',
                  TargetContent: remMatch ? remMatch[1] : ''
                },
                status: 'running',
                timestamp: Date.now()
              }
            });
          }
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
            agentName: (msg as any).name?.startsWith('Subagent') ? (msg as any).name : undefined
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

      const editTools = ['editFile', 'writeFile', 'createFile', 'replace_file_content', 'multi_replace_file_content', 'write_to_file', 'run_command'];
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
      }

      if (!targetPath) targetPath = 'Unknown File';

      let added = 0;
      let removed = 0;

      const artifacts = tc.result?.artifacts || [];
      // First check for a file_change artifact with explicit added/removed
      const fileChangeArtifact = artifacts.find((a: any) => a.type === 'file_change');
      const diffArtifact = artifacts.find((a: any) => a.type === 'diff' && a.diff);

      if (fileChangeArtifact?.added !== undefined || fileChangeArtifact?.removed !== undefined) {
        added = fileChangeArtifact.added ?? 0;
        removed = fileChangeArtifact.removed ?? 0;
      } else if (diffArtifact?.diff) {
        const lines = String(diffArtifact.diff).split('\n');
        added = lines.filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length;
        removed = lines.filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length;
      } else {
        const output = tc.result?.output || '';
        const delMatch = String(output).match(/\((\d+) deletions?\)/);
        if (delMatch) {
          removed = parseInt(delMatch[1]);
        }
        // For creates: count lines in content
        if (['createFile', 'write_to_file'].includes(tc.name)) {
          const fileContent = args.CodeContent || args.content || args.file_content || '';
          added = typeof fileContent === 'string' ? fileContent.split('\n').length : 1;
        }
      }

      const fileContent = fileChangeArtifact?.content || args.CodeContent || args.content || args.file_content || args.ReplacementContent || undefined;

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

  const aggregatedFileChanges = Array.from(fileChangesMap.values()).filter(
    (change) => change.path && change.path.split(/[/\\]/).pop() !== 'implementation_plan.md'
  );
  const totalAdded = aggregatedFileChanges.reduce((sum, f) => sum + f.added, 0);
  const totalRemoved = aggregatedFileChanges.reduce((sum, f) => sum + f.removed, 0);
  const reviewArtifacts = getReviewArtifacts(
    steps.flatMap(step => step.toolCall?.result?.artifacts || []),
  ).filter((artifact, index, all) =>
    all.findIndex(candidate => candidate.path === artifact.path) === index,
  );

  const [filesExpanded, setFilesExpanded] = useState(false);

  return (
    <div className={cn("flex w-full min-w-0", isUser ? "justify-center" : "justify-start")}>
      <div className={cn(
        "flex gap-3 w-full min-w-0",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        <div className={cn(
          "flex flex-col gap-2 relative group/bubble w-full min-w-0",
          isUser ? "items-end" : "items-start"
        )}>
          {(stepsToRender.length > 0 || (isLatest && isAgentWaiting(agentState))) && (
            <AgentStepsGroup
              steps={stepsToRender}
              isStreaming={lastMessage.isStreaming}
              isWorking={isWorking}
              agentState={agentState}
              onApproveToolCall={onApproveToolCall}
              onRejectToolCall={onRejectToolCall}
              onArtifactClick={onArtifactClick}
            />
          )}

          {(displayContent || (isUser && firstMessage.attachments && firstMessage.attachments.length > 0)) ? (
            <div className={cn(
              "px-4 py-3 rounded-2xl relative group/usercontent",
              isUser
                ? "bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white rounded-tr-sm w-full pr-10"
                : "text-white/90 mt-1 w-full min-w-0 break-words"
            )}>
              {displayContent ? (
                <MarkdownRenderer content={displayContent} isStreaming={lastMessage.isStreaming && steps.length === 0} onArtifactClick={onArtifactClick} />
              ) : null}

              {isUser && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/usercontent:opacity-100 transition-opacity">
                  <Tooltip content="Undo changes up to this point"><button
                      onClick={() => setShowUndoModal(true)}
                      className="hover:text-white/80 transition-colors p-1">
                      <Undo2 size={16} />
                    </button></Tooltip>
                </div>
              )}

              {isUser && firstMessage.attachments && firstMessage.attachments.length > 0 && (
                <div className={cn("flex flex-wrap gap-3", displayContent ? "mt-3" : "")}>
                  {firstMessage.attachments.map((att, i) => (
                    att.content?.startsWith('data:image/') ? (
                      <img
                        key={i}
                        src={att.content}
                        alt={att.name || 'Attachment'}
                        className="w-16 h-16 object-cover rounded-lg shadow-sm border border-white/10 cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0"
                        onClick={() => setPreviewImage(att.content!)}
                      />
                    ) : null
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {reviewArtifacts.length > 0 && (
            <div className="w-full mt-2 flex flex-col gap-2">
              {reviewArtifacts.map((artifact, index) => {
                let displayName = artifact.path!.split(/[/\\]/).pop() || '';
                if (displayName === 'implementation_plan.md') {
                  displayName = 'Implementation Plan';
                }
                return (
                  <div key={`${artifact.path}-${index}`} className="w-full bg-[#121214] border border-white/5 rounded-xl overflow-hidden font-sans shadow-lg">
                    <button
                      type="button"
                      onClick={() => onArtifactClick?.(artifact.path!)}
                      className="flex items-center gap-2 w-full text-left px-3 py-3.5 hover:bg-white/5 transition-colors text-white/80"
                    >
                      <FileCode size={14} className="shrink-0 text-blue-400" />
                      <span className="font-medium text-[13px] truncate">{displayName}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {aggregatedFileChanges.length > 0 && (
            <div className="w-full mt-2 bg-[#121214] border border-white/5 rounded-xl overflow-hidden font-sans shadow-lg">
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setFilesExpanded(!filesExpanded)}
              >
                <div className="flex items-center gap-2 text-[13px] text-white/80">
                  {aggregatedFileChanges.length} {aggregatedFileChanges.length === 1 ? 'file' : 'files'} changed
                  {(totalAdded > 0 || totalRemoved > 0) && (
                    <>
                      <span className="text-[#4ec9b0] font-mono ml-1">+{totalAdded}</span>
                      <span className="text-[#f14c4c] font-mono">-{totalRemoved}</span>
                    </>
                  )}
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
                <Tooltip content={isTextCopied ? "Copied!" : "Copy"}><button
                    onClick={() => {
                      navigator.clipboard.writeText(firstMessage.content || '');
                      setIsTextCopied(true);
                      setTimeout(() => setIsTextCopied(false), 2000);
                    }}
                    className="hover:text-white transition-colors flex items-center justify-center w-4 h-4">
                    {isTextCopied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                  </button></Tooltip>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Undo Confirmation Modal */}
      {isUser && (() => {
        const initialSnapshot = conversationId ? getSnapshotForMessage(conversationId, firstMessage.id) : undefined;
        const fileChanges = checkpointChanges ?? [];

        return (
          <UndoConfirmModal
            isOpen={showUndoModal}
            changes={fileChanges}
            hasCheckpoint={Boolean(initialSnapshot?.gitCheckpoint)}
            checkpointError={Boolean(initialSnapshot?.checkpointError && !initialSnapshot?.gitCheckpoint)}
            error={undoError || undefined}
            onCancel={() => setShowUndoModal(false)}
            onConfirm={async () => {
              const success = await onUndoToMessage?.(firstMessage.id);
              if (success === false) setUndoError('Unable to restore the checkpoint. No messages or snapshots were removed.');
              else setShowUndoModal(false);
            }}
          />
        );
      })()}

      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative flex flex-col items-center bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl w-fit h-fit min-w-[350px] max-w-[90vw] max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="w-full flex justify-end gap-3 p-4 pb-0 z-20">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // We must pass a Promise directly to ClipboardItem to preserve the user gesture context
                      const blobPromise = fetch(previewImage)
                        .then(res => res.blob())
                        .then(blob => {
                          if (blob.type === 'image/png') return blob;
                          return new Promise<Blob>((resolve, reject) => {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = img.width;
                              canvas.height = img.height;
                              const ctx = canvas.getContext('2d');
                              ctx?.drawImage(img, 0, 0);
                              canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas failed')), 'image/png');
                            };
                            img.onerror = () => reject(new Error('Image load failed'));
                            img.src = previewImage;
                          });
                        });
                      
                      await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blobPromise })
                      ]);
                      setIsImageCopied(true);
                      setTimeout(() => setIsImageCopied(false), 2000);
                    } catch (err: any) {
                      alert('Failed to copy image: ' + (err?.message || err));
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/10 transition-colors shadow-sm w-32 justify-center"
                >
                  {isImageCopied ? (
                    <>
                      <Check size={14} className="text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy Image
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const a = document.createElement('a');
                    a.href = previewImage;
                    a.download = 'image.png';
                    a.click();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/10 transition-colors shadow-sm"
                >
                  <Download size={14} />
                  Download Image
                </button>
              </div>
              <div className="w-full flex-1 flex items-center justify-center p-6 pt-4 min-h-0">
                <img src={previewImage} alt="Preview" className="max-w-full max-h-[calc(90vh-80px)] object-contain rounded-lg shadow-xl" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

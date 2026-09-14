import React, { useState } from 'react';
import { ToolCall } from '../../lib/messageTypes';
import { Terminal, FileEdit, Search, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle, Brain, Globe, FileCode, Wrench, SquareTerminal, FilePlus, Loader2, Mail, Star, Square, ArrowLeft, ArrowRight, RotateCcw, Lock, Code } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CodeBlock } from './CodeBlock';
import { ToolApprovalCard } from './ToolApprovalCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FileIcon } from './FileIcon';
import { getFileActivityPrefix } from '../../lib/fileActivity';
import { GmailEmailPreview } from './GmailEmailPreview';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

// ── File write/edit names ────────────────────────────────────────────────────
const WRITE_TOOLS = ['writeFile', 'createFile', 'write_to_file'];
const EDIT_TOOLS  = ['editFile', 'replace_file_content', 'multi_replace_file_content'];
const FILE_TOOLS  = [...WRITE_TOOLS, ...EDIT_TOOLS];

/** Compute live +N -N from tool arguments (before execution) */
function getLiveDiffStats(toolName: string, args: Record<string, any>): { added: number; removed: number } {
  if (typeof args._liveAdded === 'number' || typeof args._liveRemoved === 'number') {
    return { added: args._liveAdded || 0, removed: args._liveRemoved || 0 };
  }
  if (WRITE_TOOLS.includes(toolName)) {
    // Support both CodeContent (native) and ReplacementContent (used by live streaming injector)
    const content = args.content || args.CodeContent || args.ReplacementContent || '';
    const lines = typeof content === 'string' ? content.split('\n').length : 0;
    return { added: lines, removed: 0 };
  }
  // For edit tools compute from TargetContent (removed) and ReplacementContent (added)
  if (toolName === 'multi_replace_file_content') {
    let added = 0; let removed = 0;
    const chunks: any[] = args.ReplacementChunks || [];
    for (const c of chunks) {
      added   += (c.ReplacementContent || '').split('\n').length;
      removed += (c.TargetContent       || '').split('\n').length;
    }
    return { added, removed };
  }
  const replacement = args.ReplacementContent ?? args.content ?? '';
  const target = args.TargetContent ?? (args.operation === 'replace' ? args.anchor : '');
  const added = replacement ? String(replacement).split('\n').length : 0;
  const removed = target ? String(target).split('\n').length : 0;
  return { added: Math.max(added, 0), removed: Math.max(removed, 0) };
}

/** Rich card shown for write/edit file tool steps */
function FileEditCard({ step }: { step: AgentStep }) {
  const tc = step.toolCall!;
  const args = tc.arguments || {};
  const isRunning = step.status === 'running' || step.status === 'pending';
  const isError   = step.status === 'error';

  const filePath = args.TargetFile || args.path || args.file || '';
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const ext = fileName.split('.').pop() || '';

  const isWrite = WRITE_TOOLS.includes(tc.name);
  const actionLabel = isRunning
    ? getFileActivityPrefix(tc)
    : isError
      ? `${getFileActivityPrefix(tc)} failed`
      : getFileActivityPrefix(tc);

  // Get diff stats: prefer result artifacts, fallback to live argument-based stats
  let stats: { added: number; removed: number } | null = null;
  if (!isRunning && tc.result) {
    const artifacts = tc.result.artifacts || [];
    const diffArt = artifacts.find((a: any) => a.type === 'diff' && a.diff);
    if (diffArt?.diff) {
      const lines = String(diffArt.diff).split('\n');
      stats = {
        added:   lines.filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length,
        removed: lines.filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length,
      };
    }
  }
  // Always show live stats (from args) when running or when no result-based stats
  if (!stats) stats = getLiveDiffStats(tc.name, args);

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md font-sans text-[13px]">
      {/* Spinner / done icon */}
      {isRunning ? (
        <Loader2 size={13} className="text-blue-400 animate-spin shrink-0" />
      ) : isError ? (
        <XCircle size={13} className="text-red-400 shrink-0" />
      ) : (
        <CheckCircle2 size={13} className="text-white/30 shrink-0" />
      )}

      {/* Action label */}
      <span className={cn(
        "font-medium",
        isRunning ? "shimmer-text" : isError ? "text-red-400" : "text-white/60"
      )}>
        {actionLabel}
      </span>

      {/* File icon + name */}
      <button
        className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors text-white/80 font-medium"
        onClick={(e) => {
          e.stopPropagation();
          const content = args.CodeContent || args.content || args.ReplacementContent || '';
          window.dispatchEvent(new CustomEvent('open-sidebar-file', {
            detail: { path: filePath, content, type: isWrite ? 'created' : 'updated' }
          }));
        }}
      >
        <FileIcon filename={fileName} size={16} />
        <span className="font-mono text-[12px]">{fileName}</span>
      </button>

      {/* +N -N diff stats */}
      {stats && (stats.added > 0 || stats.removed > 0) && (
        <span className="flex items-center gap-1 font-mono text-[11px] font-semibold ml-0.5">
          {stats.added   > 0 && <span className="text-emerald-400">+{stats.added}</span>}
          {stats.removed > 0 && <span className="text-red-400">-{stats.removed}</span>}
        </span>
      )}
    </div>
  );
}

export type AgentStepType = 'thinking' | 'tool';

export interface AgentStep {
  id: string;
  type: AgentStepType;
  status: 'running' | 'completed' | 'error' | 'pending' | 'rejected' | 'approved';
  title?: string; // Human readable title
  content?: string; // Raw thinking text
  toolCall?: ToolCall;
  durationMs?: number;
  agentName?: string;
}

// Removed duplicate interface

function getBashLikeCommand(name: string, args: Record<string, any>): { cmd: string; argsStr: string } {
  const normalizedName = name.replace(/^mcp__[a-zA-Z0-9_-]+__/, '');
  switch (normalizedName) {
    case 'listDirectory':
    case 'list_dir':
      return { cmd: 'ls', argsStr: args.path || args.DirectoryPath || '.' };
    case 'readFile':
    case 'view_file':
      return { cmd: 'cat', argsStr: args.path || args.AbsolutePath || '' };
    case 'writeFile':
    case 'createFile':
      return { cmd: 'Created/Wrote File', argsStr: args.path || args.TargetFile || '' };
    case 'editFile':
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return { cmd: 'sed', argsStr: `-i ... ${args.path || args.TargetFile || ''}` };
    case 'deleteFolder':
      return { cmd: 'rm', argsStr: args.path || '' };
    case 'renameFile':
    case 'renameFolder':
      return { cmd: 'mv', argsStr: `${args.path || args.oldPath || ''} ${args.newPath || ''}` };
    case 'createFolder':
      return { cmd: 'mkdir', argsStr: args.path || '' };
    case 'searchFiles':
    case 'grep_search':
      return { cmd: 'grep', argsStr: `-rn "${args.query || args.Query || ''}" ${args.path || args.SearchPath || '.'}` };
    case 'runCommand':
    case 'run_command': {
      const fullCmd = String(args.command || args.CommandLine || 'sh');
      const parts = fullCmd.split(' ');
      return { cmd: parts[0], argsStr: parts.slice(1).join(' ') };
    }
    case 'gitStatus':
      return { cmd: 'git', argsStr: 'status' };
    case 'gitAdd':
      return { cmd: 'git', argsStr: `add ${args.paths ? (Array.isArray(args.paths) ? args.paths.join(' ') : String(args.paths)) : '.'}` };
    case 'gitCommit':
      return { cmd: 'git', argsStr: `commit -m "..."` };
    case 'gitDiff':
      return { cmd: 'git', argsStr: 'diff' };
    case 'ask_question':
    case 'askUser':
      return { cmd: 'ask', argsStr: 'user' };
    case 'createTodoListTasks':
      return { cmd: 'Created', argsStr: 'To-Do List Tasks' };
    case 'updateTaskStatus':
      return { cmd: 'Updated', argsStr: `Task Status` };
    case 'invokeSubagent':
      return { cmd: 'Invoked', argsStr: `Sub-Agent (${args.taskId || ''})` };
    default:
      return { cmd: String(name), argsStr: JSON.stringify(args) };
  }
}

export interface AgentProgressCardProps {
  step: AgentStep;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onArtifactClick?: (path: string) => void;
}

export function AgentProgressCard({ step, onApprove, onReject, onArtifactClick }: AgentProgressCardProps) {
  const [expanded, setExpanded] = useState(step.status === 'running' || step.status === 'pending');

  React.useEffect(() => {
    if (step.status === 'running' || step.status === 'pending') {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [step.status]);

  // ToolApprovalCard is now rendered exclusively in ChatContainer replacing the input box.
  // We no longer render it inline in the chat history.

  // Map internal tools to human-readable strings and icons
  const getStepDetails = () => {
    if (step.type === 'thinking') {
      const content = step.content || '';
      // Extract the main action from thinking content
      if (content.includes('UNDERSTAND')) {
        return { icon: <Brain size={14} />, text: 'Analyzing the request...', color: 'text-purple-400' };
      }
      if (content.includes('ANALYZE')) {
        return { icon: <Search size={14} />, text: 'Analyzing codebase context...', color: 'text-blue-400' };
      }
      if (content.includes('PLAN')) {
        return { icon: <Brain size={14} />, text: 'Planning the approach...', color: 'text-purple-400' };
      }
      if (content.includes('IDENTIFY')) {
        return { icon: <AlertCircle size={14} />, text: 'Identifying potential risks...', color: 'text-yellow-400' };
      }
      if (content.includes('EXECUTE')) {
        return { icon: <Wrench size={14} />, text: 'Preparing to execute...', color: 'text-green-400' };
      }
      return { icon: <Brain size={14} />, text: 'Thinking through the approach...', color: 'text-purple-400' };
    }

    if (step.toolCall) {
      const args = step.toolCall.arguments || {};
      const { cmd, argsStr } = getBashLikeCommand(step.toolCall.name, args);
      const actionWord = (step.status === 'running' || step.status === 'pending') ? 'Running' : 'Ran';
      const isFailed = step.status === 'error' || step.status === 'rejected';

      let displayStr = `${cmd} ${argsStr}`.trim();
      if (displayStr.length > 50) displayStr = displayStr.slice(0, 47) + '...';

      // Special case for agent tools so they don't say "Ran Created To-Do List Tasks"
      if (['createTodoListTasks', 'updateTaskStatus', 'invokeSubagent', ...FILE_TOOLS].includes(step.toolCall.name)) {
        if (FILE_TOOLS.includes(step.toolCall.name)) {
          const filePath = args.path || args.TargetFile || '';
          const content = args.content || args.CodeContent || args.ReplacementContent || '';
          const fileName = filePath.split(/[/\\]/).pop();
          // Check if the file artifact says this was a new file or an update
           const fileArtifact = step.toolCall.result?.artifacts?.find((a: any) => a.type === 'file_change');
           const isNew = fileArtifact ? (fileArtifact as any).isNew !== false : step.toolCall.name === 'createFile';
           const actionLabel = getFileActivityPrefix(step.toolCall);
          return {
            icon: <SquareTerminal size={14} className="text-gray-400" />,
            text: (
              <span className="flex items-center gap-1.5">
                {actionLabel}{' '}
                <button
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-white/90 font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('open-sidebar-file', { detail: { path: filePath, content, type: isNew ? 'created' : 'updated' } }));
                  }}
                >
                  <FileCode size={14} className="text-blue-400" /> {fileName}
                </button>
              </span>
            ),
            color: 'text-gray-400'
          };
        }
        if (step.toolCall.name === 'invokeSubagent') {
          const fileActivity = (step.toolCall as any).subagentFileActivity;
          const role = step.toolCall.arguments?.role || 'Sub agent';
          if (fileActivity) {
            if (step.status === 'completed') {
               return { icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>, text: `${role} wrote ${fileActivity.fileName}`, color: 'text-emerald-400' };
            } else {
               return { icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 Z"/></svg>, text: `${fileActivity.role || role} is Editing ${fileActivity.fileName}`, color: 'text-blue-400' };
            }
          }
          return { icon: <Brain size={14} />, text: `${role} is Working...`, color: 'text-purple-400' };
        }
        if (isFailed && ['createTodoListTasks', 'updateTaskStatus', 'invokeSubagent'].includes(step.toolCall.name)) {
          const failureLabels: Record<string, string> = {
            createTodoListTasks: 'Failed to create To-Do List Tasks',
            updateTaskStatus: 'Failed to update Task Status',
            invokeSubagent: 'Failed to invoke Sub-Agent',
          };
          return { icon: <AlertCircle size={14} />, text: failureLabels[step.toolCall.name], color: 'text-red-400' };
        }
        return { icon: <Brain size={14} />, text: displayStr, color: 'text-purple-400' };
      }

      return { icon: <SquareTerminal size={14} />, text: `${actionWord} ${displayStr}`, color: 'text-gray-400' };
    }

    return { icon: <Wrench size={14} />, text: 'Working...', color: 'text-gray-400' };
  };

  const { icon, text, color } = getStepDetails();

  const getStatusIcon = () => {
    switch (step.status) {
      case 'running': return null; // We use a custom shimmer instead
      case 'completed': return <CheckCircle2 size={14} className="text-white/40" />;
      case 'error': return <AlertCircle size={14} className="text-red-400" />;
      case 'rejected': return <XCircle size={14} className="text-gray-400" />;
      default: return null;
    }
  };

  const isRunning = step.status === 'running';
  let hasDetails = !!step.content || !!(step.toolCall && ((step.toolCall.arguments && Object.keys(step.toolCall.arguments).length > 0) || step.toolCall.result));

  // Hide the expandable dropdown for internal orchestration tools to prevent showing raw system output
   if (step.toolCall && ['createTodoListTasks', 'updateTaskStatus', 'invokeSubagent', ...FILE_TOOLS].includes(step.toolCall.name)) {
     hasDetails = step.status === 'error' || step.status === 'rejected';
  }

  // Extract artifacts if any
  const artifacts = step.toolCall?.result?.artifacts || [];

  // Compute diff stats from file-edit artifacts
  const getDiffStats = (): { added: number; removed: number } | null => {
    if (!step.toolCall) return null;

    // Bubble up diff stats from sub-agents
    const fileActivity = (step.toolCall as any).subagentFileActivity;
    if (step.toolCall.name === 'invokeSubagent' && fileActivity) {
      return { added: fileActivity.added || 0, removed: fileActivity.removed || 0 };
    }

    if (step.status !== 'completed') return null;
    const editTools = ['editFile', 'writeFile', 'createFile', 'replace_file_content', 'multi_replace_file_content'];
    if (!editTools.includes(step.toolCall.name)) return null;

    const diffArtifact = artifacts.find((a: any) => a.type === 'diff' && a.diff);
    if (diffArtifact?.diff) {
      const lines = String(diffArtifact.diff).split('\n');
      const added = lines.filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length;
      const removed = lines.filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length;
      return { added, removed };
    }

    // Fallback: try parsing the output text for diff info
    const output = step.toolCall.result?.output || '';
    const addMatch = String(output).match(/(\d+) insertion/);
    const delMatch = String(output).match(/(\d+) deletion/);
    if (addMatch || delMatch) {
      return {
        added: addMatch ? parseInt(addMatch[1]) : 0,
        removed: delMatch ? parseInt(delMatch[1]) : 0,
      };
    }

    // If this is a create/write file step, try to read stats from artifact
    if (['writeFile', 'createFile', 'write_to_file'].includes(step.toolCall.name)) {
      const fileArtifact = artifacts.find((a: any) => a.type === 'file_change');
      if (fileArtifact && ((fileArtifact as any).added !== undefined || (fileArtifact as any).removed !== undefined)) {
        return { added: (fileArtifact as any).added ?? 0, removed: (fileArtifact as any).removed ?? 0 };
      }
      return null;
    }

    // Show +1 -1 as a minimum indicator when a file was edited (if not write/create)
    return { added: 1, removed: 1 };
  };

  const diffStats = getDiffStats();
  const isRunningSubagent = isRunning && step.toolCall?.name === 'invokeSubagent';

  // ── Dedicated file write/edit card (shown both while running AND completed) ──
  if (step.type === 'tool' && step.toolCall && FILE_TOOLS.includes(step.toolCall.name)) {
    return (
      <div className="space-y-2">
        <FileEditCard step={step} />
      </div>
    );
  }

  if (step.type === 'tool' && step.toolCall && step.toolCall.name.startsWith('mcp__gmail__')) {
    const isError = step.status === 'error' || step.status === 'rejected';
    const output = step.toolCall.result?.output || '';
    const args = step.toolCall.arguments || {};
    
    // Parse emails if it's a list operation and output is a string
    const isList = step.toolCall.name === 'mcp__gmail__list_emails';
    const isRead = step.toolCall.name === 'mcp__gmail__read_email';
    const emails = [];
    if (isList && typeof output === 'string' && output) {
      const blocks = output.split('\n---');
      for (const block of blocks) {
        if (!block.trim()) continue;
        const fromMatch = block.match(/From:\s*([^\n]+)/);
        const subjectMatch = block.match(/Subject:\s*([^\n]+)/);
        const snippetMatch = block.match(/Snippet:\s*([\s\S]+)/);
        
        const from = fromMatch ? fromMatch[1].trim() : 'Unknown';
        const subject = subjectMatch ? subjectMatch[1].trim() : '(no subject)';
        const snippet = snippetMatch ? snippetMatch[1].replace(/\n/g, ' ').trim() : '';
        
        emails.push({ from, subject, snippet });
      }
    }

    const GmailLogo = () => (
      <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.25 7.042v10.457c0 1.05.85 1.9 1.9 1.9h2.85V10.85L12 14.65l5-3.8v8.549h2.85c1.05 0 1.9-.85 1.9-1.9V7.042c0-.365-.1-.722-.294-1.026-.543-.85-1.636-1.127-2.527-.61L12 10.65 4.921 5.405c-.89-.517-1.984-.24-2.527.61-.194.304-.294.661-.294 1.027z" fill="#4285F4"/>
        <path d="M16.999 19.399h3.8c1.05 0 1.9-.85 1.9-1.9V7.042c0-.365-.1-.722-.294-1.026l-5.406 4.834v8.549z" fill="#34A853"/>
        <path d="M2.25 7.042c0-.365.1-.722.294-1.026.543-.85 1.636-1.127 2.527-.61l6.93 5.244L16.999 5.405c.891-.517 1.985-.24 2.528.61.194.304.294.661.294 1.027V9.75L12 15.65 2.25 9.75V7.042z" fill="#EA4335"/>
        <path d="M2.25 19.399V9.75L12 15.65v-5.05L4.921 5.405c-.89-.517-1.984-.24-2.527.61-.194.304-.294.661-.294 1.027v12.357z" fill="#FBBC05"/>
      </svg>
    );
    
    return (
      <div className={cn(
          "w-full my-2 rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white",
          isRunning || step.status === 'pending' ? "opacity-70 animate-pulse" : ""
      )}>
        {/* Header - Gmail Style */}
        <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GmailLogo />
            <span className="font-medium text-gray-600 text-lg tracking-tight" style={{fontFamily: 'Product Sans, Roboto, sans-serif'}}>Gmail</span>
          </div>
          
          <div className="flex-1 max-w-xl">
            <div className="flex items-center gap-3 px-4 py-2 bg-[#f1f3f4] rounded-full text-gray-600">
              <Search size={18} className="text-gray-500" />
              <span className="text-[14px] text-gray-600 truncate font-sans">
                {isList ? (args.query || 'Search mail') : isRead ? 'Read Message' : (args.to || 'Compose')}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white min-h-[100px] text-sm font-sans text-gray-800">
          {isList ? (
            <div className="flex flex-col">
              {emails.length > 0 ? (
                emails.map((email, idx) => {
                  const senderName = email.from.split('<')[0].replace(/"/g, '').trim();
                  return (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer group transition-colors">
                      <div className="flex items-center gap-3 text-gray-300">
                        <Square size={16} className="group-hover:text-gray-400" />
                        <Star size={16} className="group-hover:text-gray-400" />
                      </div>
                      <div className="w-40 font-semibold text-gray-800 truncate">
                        {senderName}
                      </div>
                      <div className="flex-1 truncate text-gray-600 flex items-center">
                        <span className="font-semibold text-gray-800 mr-2">{email.subject}</span>
                        <span className="text-gray-400 mr-2">-</span>
                        <span className="truncate">{email.snippet}</span>
                      </div>
                    </div>
                  )
                })
              ) : isRunning ? (
                <div className="p-6 text-center text-gray-500 italic flex justify-center items-center gap-2"><Loader2 className="animate-spin" size={16}/> Loading emails...</div>
              ) : (
                <div className="p-6 text-center text-gray-500">{typeof output === 'string' && output.includes('Error') ? output : 'No emails found.'}</div>
              )}
            </div>
          ) : isRead ? (
            <div className="p-4 bg-gray-50 flex justify-center">
              {output ? <GmailEmailPreview content={typeof output === 'string' ? output : ''} /> : (isRunning ? <span className="flex items-center gap-1"><Loader2 className="animate-spin" size={12}/> Loading email...</span> : 'No content')}
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-4 space-y-0 max-w-2xl border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="flex px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="w-16 text-gray-500 text-sm">To</span>
                  <span className="text-gray-800 text-sm">{args.to}</span>
                </div>
                <div className="flex px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="w-16 text-gray-500 text-sm">Subject</span>
                  <span className="text-gray-800 text-sm font-medium">{args.subject}</span>
                </div>
                <div className="p-4 text-gray-700 whitespace-pre-wrap min-h-[120px] text-sm bg-white">
                  {args.body}
                </div>
              </div>
              <div className="text-xs text-gray-500 px-1">
                {output ? output : (isRunning ? <span className="flex items-center gap-1"><Loader2 className="animate-spin" size={12}/> Sending...</span> : '')}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'tool' && step.toolCall && step.toolCall.name.startsWith('mcp__playwright__')) {
    const isError = step.status === 'error' || step.status === 'rejected';
    const output = step.toolCall.result?.output || '';
    const args = step.toolCall.arguments || {};
    
    // Determine action type
    const actionStr = step.toolCall.name.replace('mcp__playwright__browser_', '').replace('mcp__playwright__', '').replace(/_/g, ' ');
    
    // Extract URL if possible
    let currentUrl = args.url || 'browser://new-tab';
    if (!args.url && typeof output === 'string') {
      const urlMatch = output.match(/Page URL:\s*([^\n]+)/);
      if (urlMatch) {
        currentUrl = urlMatch[1].trim();
      }
    }

    return (
      <div className={cn(
          "w-full my-3 rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-white flex flex-col font-sans",
          isRunning || step.status === 'pending' ? "opacity-70 animate-pulse" : ""
      )}>
        {/* Chrome Tab Bar */}
        <div className="flex items-end px-2 pt-2 bg-[#fbeff0] border-b border-gray-200">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-t-lg border border-gray-200 border-b-0 min-w-[150px] max-w-[200px]">
            {/* Google G Icon SVG */}
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-[11px] text-gray-700 truncate font-medium">{actionStr === 'navigate' ? currentUrl.replace('https://', '').replace('http://', '').split('/')[0] : 'New Tab'}</span>
          </div>
        </div>
        
        {/* Chrome Toolbar */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-white border-b border-gray-200">
          <div className="flex items-center gap-3 ml-1">
             <ArrowLeft size={16} className="text-gray-500 hover:text-gray-700 cursor-pointer" />
             <ArrowRight size={16} className="text-gray-300" />
             <RotateCcw size={14} className="text-gray-500 hover:text-gray-700 cursor-pointer" />
          </div>
          
          <div className="flex-1 flex items-center gap-2 bg-[#f1f3f4] hover:bg-[#e8eaed] transition-colors px-3 py-1.5 rounded-full text-[13px] text-gray-800 border border-transparent focus-within:border-blue-300 focus-within:bg-white ml-2">
            <Lock size={12} className="text-gray-500 shrink-0" />
            <span className="truncate">{currentUrl}</span>
          </div>
        </div>

        {/* Browser Body/Action Description */}
        <div className="flex flex-col bg-[#f8f9fa] p-0 text-sm">
           <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white text-gray-700 font-sans">
             {actionStr === 'navigate' ? <Globe size={16} className="text-blue-500" /> : actionStr === 'find' ? <Search size={16} className="text-emerald-500" /> : <Code size={16} className="text-amber-500" />}
             <span className="font-semibold capitalize text-[13px]">{actionStr}</span>
             {args.text && <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-xs ml-2 truncate max-w-[200px] border border-gray-200">"{args.text}"</span>}
             {args.selector && <span className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-xs ml-2 truncate max-w-[200px] border border-gray-200">`{args.selector}`</span>}
           </div>
           
           {args.function && (
             <div className="p-3 bg-white border-b border-gray-200">
               <div className="bg-gray-50 rounded-md border border-gray-200 overflow-hidden prose prose-sm max-w-none prose-pre:m-0 prose-pre:p-2.5 prose-pre:bg-transparent prose-pre:border-0 prose-pre:text-gray-700 text-[12px] custom-scrollbar">
                 <MarkdownRenderer content={`\`\`\`javascript\n${args.function}\n\`\`\``} />
               </div>
             </div>
           )}

           <div className="text-gray-800 max-h-[350px] overflow-y-auto custom-scrollbar text-[13px] p-4 bg-white">
              {output ? (
                typeof output === 'string' ? (
                  <div className="prose prose-sm max-w-none prose-pre:bg-[#f8f9fa] prose-pre:border prose-pre:border-gray-200 prose-pre:text-gray-700 prose-headings:text-gray-800 prose-headings:font-medium prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0 prose-a:text-blue-600 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                    <MarkdownRenderer content={output} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(output, null, 2)}</pre>
                )
              ) : isRunning ? (
                <span className="text-gray-400 flex items-center gap-2 font-mono text-xs"><Loader2 size={14} className="animate-spin" /> Running browser action...</span>
              ) : null}
           </div>
        </div>
      </div>
    );
  }

  if (step.type === 'tool' && step.toolCall && !['writeFile', 'createFile', 'write_to_file', 'createTodoListTasks', 'updateTaskStatus', 'invokeSubagent'].includes(step.toolCall.name)) {
    const cmdObj = getBashLikeCommand(step.toolCall.name, step.toolCall.arguments || {});
    const isError = step.status === 'error' || step.status === 'rejected';
    const output = step.toolCall.result?.output || '';

    const session = (() => { try { return JSON.parse(localStorage.getItem('quantix_session') || '{}'); } catch { return {}; } })();
    const rawName: string = session?.name || 'user';
    const linuxUser = rawName.includes('@') ? rawName.split('@')[0].toLowerCase() : rawName.toLowerCase().replace(/\s+/g, '');

    return (
      <div
          className={cn(
          "w-full my-2 shadow-xl shadow-black/30",
          isRunning || step.status === 'pending' ? "running-border-wrapper" : "rounded-xl overflow-hidden"
        )}
      >
        <div
          className={cn(
            "font-mono text-[13px] min-h-[90px] flex flex-col w-full h-full",
            isRunning || step.status === 'pending' ? "running-border-inner" : ""
          )}
          style={!(isRunning || step.status === 'pending') ? { background: '#212124' } : undefined}
        >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 font-sans text-white/55 text-[11px]">
          <SquareTerminal size={14} className="text-white/50" />
          <span className="tracking-widest uppercase text-[10px] font-semibold">Terminal</span>
        </div>
        {/* Body */}
        <div className="p-3 pt-1.5 space-y-2">
          <div className="flex items-start gap-1.5 break-all">
            {/* linux@user:~$ prompt */}
            <span className="shrink-0">
              <span style={{ color: '#4ec9b0' }}>linux@{linuxUser}</span>
              <span className="text-white/40">:</span>
              <span style={{ color: '#569cd6' }}>~</span>
              <span className="text-white/40">$ </span>
            </span>
            <div className="flex-1">
              <span style={{ color: '#ce9178' }}>{cmdObj.cmd}</span>
              <span style={{ color: '#9cdcfe' }} className="ml-1.5">{cmdObj.argsStr}</span>
              {isRunning && <span className="text-white/25 text-xs animate-pulse ml-1">▋</span>}
            </div>
          </div>
          {output ? (
            <div className="whitespace-pre-wrap pl-5 leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar" style={{ color: '#858585' }}>
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </div>
          ) : isRunning ? (
            <div className="whitespace-pre-wrap pl-5 leading-relaxed" style={{ color: '#858585' }}>
              <span className="animate-pulse">Waiting for response...</span>
            </div>
          ) : null}
          {step.toolCall.result?.attachments?.map((att, i) => (
            <div key={i} className="pl-5 pt-2">
              {att.content?.startsWith('data:image') ? (
                <div className="relative max-w-sm rounded-lg overflow-hidden border border-white/10 shadow-lg">
                  <div className="absolute top-0 left-0 w-full p-1.5 bg-black/60 backdrop-blur-md text-[9px] font-mono text-white/70 flex items-center gap-1.5 z-10">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    Vision Analysis Active
                  </div>
                  <img src={att.content} alt={att.name || 'Screenshot preview'} className="w-full h-auto opacity-90 hover:opacity-100 transition-opacity" />
                </div>
              ) : (
                <div className="text-xs text-[#858585] flex items-center gap-1"><FileCode size={12}/> {att.name}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="w-full font-sans text-sm relative">
      <div
        className={cn(
          "flex items-center justify-between py-1 px-2 rounded-md border border-transparent transition-colors relative overflow-hidden",
          hasDetails ? "cursor-pointer hover:bg-white/5" : "",
          "bg-transparent"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Animated Running Border for Sub-agents */}
        {isRunningSubagent && (
          <>
            <div className="absolute inset-[-100%] animate-[spin_2s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_70%,#a855f7_100%)] opacity-70 pointer-events-none" />
            <div className="absolute inset-[1px] bg-[#0f0f13] rounded-md pointer-events-none z-0" />
          </>
        )}

        <div className="flex items-center gap-3 relative z-10">
          <div className={color}>
            {icon}
          </div>
          <span className={cn(
            "font-medium",
            isRunning ? "shimmer-text" : "text-white/70"
          )}>
            {step.title || text}
          </span>
          {diffStats && (
            <span className="flex items-center gap-1 text-[11px] font-mono font-semibold">
              <span className="text-emerald-400">+{diffStats.added}</span>
              <span className="text-red-400">-{diffStats.removed}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 relative z-10 text-white/40">
          {!isRunning && getStatusIcon()}
          {step.durationMs && <span className="text-xs">{step.durationMs}ms</span>}
          {hasDetails && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </div>
      </div>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 pl-10 space-y-3 bg-[#0a0a0c] rounded-b-md border-x border-b border-white/5 mt-[-2px]">
              {step.type === 'thinking' && step.content && (
                <div className="text-white/60 text-sm opacity-90 prose-p:!my-2 prose-h3:!text-[13px] prose-h3:!uppercase prose-h3:!tracking-wider prose-h3:!text-purple-400/80 prose-h3:!mt-0 prose-h3:!mb-1">
                  <MarkdownRenderer content={step.content} isStreaming={isRunning} />
                </div>
              )}

              {step.type === 'tool' && step.toolCall && (
                <div className="space-y-2">
                  {['writeFile', 'createFile', 'write_to_file'].includes(step.toolCall.name) ? (
                    <div className="max-h-[400px] overflow-y-auto overflow-x-auto rounded-xl w-full">
                      <CodeBlock
                        language={((step.toolCall.arguments?.path || step.toolCall.arguments?.TargetFile || '').split('.').pop() || 'text')}
                        code={step.toolCall.arguments?.content || step.toolCall.arguments?.CodeContent || ''}
                        filename={(step.toolCall.arguments?.path || step.toolCall.arguments?.TargetFile || '').split(/[/\\]/).pop()}
                      />
                    </div>
                  ) : (
                    <div className="font-mono text-xs bg-black rounded-md border border-white/10 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                      <span className="text-white/40 mr-2">$</span>
                      <span className="text-blue-400 font-medium">{getBashLikeCommand(step.toolCall.name, step.toolCall.arguments || {}).cmd}</span>
                      <span className="text-white/60 ml-2 break-all">
                        {getBashLikeCommand(step.toolCall.name, step.toolCall.arguments || {}).argsStr}
                      </span>
                    </div>
                    {step.toolCall.result && (
                      <div className="p-3 text-gray-300 overflow-x-auto max-h-[300px] overflow-y-auto w-full">
                        {typeof step.toolCall.result.output === 'string' && !step.toolCall.result.output.trim().startsWith('{') && !step.toolCall.result.output.trim().startsWith('[') ? (
                          <div className="whitespace-pre-wrap">{step.toolCall.result.output}</div>
                        ) : (
                          <CodeBlock language="json" code={typeof step.toolCall.result.output === 'string' ? step.toolCall.result.output : JSON.stringify(step.toolCall.result.output, null, 2)} />
                        )}
                      </div>
                    )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

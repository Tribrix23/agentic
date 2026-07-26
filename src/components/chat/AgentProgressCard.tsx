import React, { useState } from 'react';
import { ToolCall } from '../../lib/messageTypes';
import { Terminal, FileEdit, Search, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle, Brain, Globe, FileCode, Wrench, SquareTerminal } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CodeBlock } from './CodeBlock';
import { ToolApprovalCard } from './ToolApprovalCard';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export type AgentStepType = 'thinking' | 'tool';

export interface AgentStep {
  id: string;
  type: AgentStepType;
  status: 'running' | 'completed' | 'error' | 'pending' | 'rejected' | 'approved';
  title?: string; // Human readable title
  content?: string; // Raw thinking text
  toolCall?: ToolCall;
  durationMs?: number;
}

// Removed duplicate interface

function getBashLikeCommand(name: string, args: Record<string, any>): { cmd: string; argsStr: string } {
  switch (name) {
    case 'listDirectory':
    case 'list_dir':
      return { cmd: 'ls', argsStr: args.path || args.DirectoryPath || '.' };
    case 'readFile':
    case 'view_file':
      return { cmd: 'cat', argsStr: args.path || args.AbsolutePath || '' };
    case 'writeFile':
    case 'createFile':
      return { cmd: 'echo', argsStr: `... > ${args.path || args.TargetFile || ''}` };
    case 'editFile':
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return { cmd: 'sed', argsStr: `-i ... ${args.path || args.TargetFile || ''}` };
    case 'deleteFile':
      return { cmd: 'rm', argsStr: args.path || '' };
    case 'renameFile':
      return { cmd: 'mv', argsStr: `${args.path || ''} ${args.newPath || ''}` };
    case 'searchFiles':
    case 'grep_search':
      return { cmd: 'grep', argsStr: `-rn "${args.query || args.Query || ''}" ${args.path || args.SearchPath || '.'}` };
    case 'runCommand':
    case 'run_command': {
      const fullCmd = String(args.command || args.CommandLine || 'sh');
      const parts = fullCmd.split(' ');
      return { cmd: parts[0], argsStr: parts.slice(1).join(' ') };
    }
    case 'webSearch':
    case 'search_web':
      return { cmd: 'search', argsStr: String(args.query || '') };
    case 'readUrl':
    case 'read_url':
      return { cmd: 'curl', argsStr: String(args.url || args.Url || '') };
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
      
      let displayStr = `${cmd} ${argsStr}`.trim();
      if (displayStr.length > 50) displayStr = displayStr.slice(0, 47) + '...';

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
  const hasDetails = step.content || (step.toolCall && ((step.toolCall.arguments && Object.keys(step.toolCall.arguments).length > 0) || step.toolCall.result));
  
  // Extract artifacts if any
  const artifacts = step.toolCall?.result?.artifacts || [];

  // Compute diff stats from file-edit artifacts
  const getDiffStats = (): { added: number; removed: number } | null => {
    if (step.status !== 'completed' || !step.toolCall) return null;
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
    
    // Show +1 -1 as a minimum indicator when a file was edited
    return { added: 1, removed: 1 };
  };

  const diffStats = getDiffStats();

  return (
    <div className="w-full font-sans text-sm">
      <div 
        className={cn(
          "flex items-center justify-between py-1 px-2 rounded-md border border-transparent transition-colors",
          hasDetails ? "cursor-pointer hover:bg-white/5" : "",
          "bg-transparent"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
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
                <div className="text-white/60 text-sm whitespace-pre-wrap leading-relaxed">
                  {step.content}
                </div>
              )}
              
              {step.type === 'tool' && step.toolCall && (
                <div className="font-mono text-xs bg-black rounded-md border border-white/10 overflow-hidden flex flex-col">
                  <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-white/40 mr-2">$</span>
                    <span className="text-blue-400 font-medium">{getBashLikeCommand(step.toolCall.name, step.toolCall.arguments || {}).cmd}</span>
                    <span className="text-white/60 ml-2 break-all">
                      {getBashLikeCommand(step.toolCall.name, step.toolCall.arguments || {}).argsStr}
                    </span>
                  </div>
                  {step.toolCall.result && (
                    <div className="p-3 text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {typeof step.toolCall.result.output === 'string' ? step.toolCall.result.output : JSON.stringify(step.toolCall.result.output, null, 2)}
                    </div>
                  )}
                  {artifacts.length > 0 && (
                    <div className="p-3 border-t border-white/10 flex flex-col gap-2 bg-blue-500/5">
                      <div className="text-blue-400/80 font-semibold mb-1 text-[11px] uppercase tracking-wider">Generated Artifacts</div>
                      {artifacts.map((art: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => onArtifactClick && onArtifactClick(art.path)}
                          className="text-left px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded border border-blue-500/20 transition-colors flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">{art.path.split(/[/\\]/).pop()}</span>
                            {art.metadata?.Summary && <span className="text-xs text-blue-300/70 truncate max-w-[400px]">{art.metadata.Summary.split('\n')[0]}</span>}
                          </div>
                        </button>
                      ))}
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

import React, { useState } from 'react';
import { ToolCall } from '../../lib/messageTypes';
import { Terminal, FileEdit, Search, ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertCircle, Brain, Globe, FileCode, Wrench } from 'lucide-react';
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

interface AgentProgressCardProps {
  step: AgentStep;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function AgentProgressCard({ step, onApprove, onReject }: AgentProgressCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (step.type === 'tool' && step.toolCall && step.status === 'pending' && onApprove && onReject) {
    return <ToolApprovalCard toolCall={step.toolCall} onApprove={onApprove} onReject={onReject} />;
  }

  // Map internal tools to human-readable strings and icons
  const getStepDetails = () => {
    if (step.type === 'thinking') {
      return { icon: <Brain size={14} />, text: 'Thinking through the approach...', color: 'text-purple-400' };
    }
    
    if (step.toolCall) {
      const name = step.toolCall.name;
      const args = step.toolCall.arguments || {};
      
      if (name.includes('read_file') || name.includes('view_file') || name.includes('list_dir')) {
        const file = args.AbsolutePath || args.DirectoryPath || 'files';
        const filename = typeof file === 'string' ? file.split(/[/\\]/).pop() : 'files';
        return { icon: <FileCode size={14} />, text: `Explored ${filename}`, color: 'text-blue-400' };
      }
      if (name.includes('grep_search')) {
        return { icon: <Search size={14} />, text: `Searched codebase for "${args.Query || '...'}"`, color: 'text-teal-400' };
      }
      if (name.includes('write_to_file') || name.includes('replace_file_content') || name.includes('multi_replace_file_content')) {
        const file = args.TargetFile || args.AbsolutePath || 'file';
        const filename = typeof file === 'string' ? file.split(/[/\\]/).pop() : 'file';
        return { icon: <FileEdit size={14} />, text: `Edited ${filename}`, color: 'text-orange-400' };
      }
      if (name.includes('run_command')) {
        return { icon: <Terminal size={14} />, text: `Ran \`${args.CommandLine || 'command'}\``, color: 'text-green-400' };
      }
      if (name.includes('search_web') || name.includes('read_url')) {
        return { icon: <Globe size={14} />, text: `Web search: ${args.query || '...'}`, color: 'text-indigo-400' };
      }
      if (name === 'ask_question') {
        return { icon: <Brain size={14} />, text: 'Asked user a question', color: 'text-purple-400' };
      }
      return { icon: <Wrench size={14} />, text: `Using tool: ${name}`, color: 'text-gray-400' };
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
  const hasDetails = step.content || (step.toolCall && (Object.keys(step.toolCall.arguments).length > 0 || step.toolCall.result));

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
                <>
                  <div>
                    <div className="text-xs text-white/40 mb-1.5 uppercase tracking-wider font-semibold">Arguments</div>
                    <CodeBlock 
                      code={JSON.stringify(step.toolCall.arguments, null, 2)} 
                      language="json" 
                    />
                  </div>
                  {step.toolCall.result && (
                    <div className="mt-3">
                      <div className="text-xs text-white/40 mb-1.5 uppercase tracking-wider font-semibold">Result</div>
                      <CodeBlock 
                        code={step.toolCall.result.output} 
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

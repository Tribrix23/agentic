import React, { useState } from 'react';
import { ToolCall } from '../../lib/messageTypes';
import { Terminal, FileEdit, Search, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CodeBlock } from './CodeBlock';
import { ToolApprovalCard } from './ToolApprovalCard';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface ToolCallCardProps {
  toolCall: ToolCall;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

export function ToolCallCard({ toolCall, onApprove, onReject }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (toolCall.status === 'pending' && onApprove && onReject) {
    return (
      <ToolApprovalCard
        toolCall={toolCall}
        onDecision={(approved) => (approved ? onApprove(toolCall.id) : onReject(toolCall.id))}
      />
    );
  }

  const getIcon = () => {
    if (toolCall.name.includes('file')) return <FileEdit size={16} />;
    if (toolCall.name.includes('search')) return <Search size={16} />;
    return <Terminal size={16} />;
  };

  const getStatusColor = () => {
    switch (toolCall.status) {
      case 'running': return 'text-blue-500 border-blue-500/20 bg-blue-500/10';
      case 'completed': return 'text-green-500 border-green-500/20 bg-green-500/10';
      case 'error': return 'text-red-500 border-red-500/20 bg-red-500/10';
      case 'rejected': return 'text-gray-500 border-gray-500/20 bg-gray-500/10';
      default: return 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10';
    }
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running': return <Loader2 size={14} className="animate-spin" />;
      case 'completed': return <CheckCircle2 size={14} />;
      case 'error': return <AlertCircle size={14} />;
      case 'rejected': return <XCircle size={14} />;
      default: return <AlertCircle size={14} />;
    }
  };

  return (
    <div className="w-full max-w-2xl bg-[#141419] border border-white/5 rounded-lg overflow-hidden font-mono text-sm">
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="text-white/70">
            {getIcon()}
          </div>
          <span className="text-white/90 font-medium">{toolCall.name}</span>
          <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border", getStatusColor())}>
            {getStatusIcon()}
            <span className="capitalize">{toolCall.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-white/40">
          {toolCall.durationMs && <span>{toolCall.durationMs}ms</span>}
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/5 bg-[#0f0f13]"
          >
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs text-white/40 mb-2">Arguments</div>
                <CodeBlock 
                  code={JSON.stringify(toolCall.arguments, null, 2)} 
                  language="json" 
                />
              </div>
              {toolCall.result && (
                <div>
                  <div className="text-xs text-white/40 mb-2">Result</div>
                  <CodeBlock 
                    code={toolCall.result.output} 
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

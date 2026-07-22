import React, { useState } from 'react';
import { ToolCall } from '../../lib/messageTypes';
import { AlertTriangle, Check, X, Edit3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { CodeBlock } from './CodeBlock';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface ToolApprovalCardProps {
  toolCall: ToolCall;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ToolApprovalCard({ toolCall, onApprove, onReject }: ToolApprovalCardProps) {
  const [alwaysApprove, setAlwaysApprove] = useState(false);

  return (
    <motion.div 
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full max-w-2xl bg-[#1c1c21] border border-yellow-500/20 rounded-lg overflow-hidden"
    >
      <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-yellow-500/5">
        <AlertTriangle size={20} className="text-yellow-500" />
        <span className="font-semibold text-white/90">Requires Approval</span>
        <span className="text-white/60 font-mono text-sm ml-auto bg-black/20 px-2 py-1 rounded">
          {toolCall.name}
        </span>
      </div>
      <div className="p-4">
        <CodeBlock code={JSON.stringify(toolCall.arguments, null, 2)} language="json" />
      </div>
      <div className="p-4 bg-[#141419] border-t border-white/5 flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-white/60 hover:text-white/80 transition-colors">
          <input 
            type="checkbox" 
            checked={alwaysApprove} 
            onChange={(e) => setAlwaysApprove(e.target.checked)}
            className="rounded border-white/10 bg-black/20 text-blue-500 focus:ring-0"
          />
          Always approve this tool
        </label>
        <div className="flex gap-2">
          <button 
            onClick={() => onReject(toolCall.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors border border-red-500/20"
          >
            <X size={16} /> Reject
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors border border-blue-500/20">
            <Edit3 size={16} /> Edit
          </button>
          <button 
            onClick={() => onApprove(toolCall.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors border border-green-500/20"
          >
            <Check size={16} /> Approve
          </button>
        </div>
      </div>
    </motion.div>
  );
}

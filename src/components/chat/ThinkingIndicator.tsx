import React from 'react';
import { Square } from 'lucide-react';
import { motion } from 'framer-motion';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

import { AgentState } from '../../lib/types/AgentTypes';

interface ThinkingIndicatorProps {
  status?: string;
  agentState?: AgentState;
  iteration?: number;
  maxIterations?: number;
  elapsed?: number;
  onStop?: () => void;
}

export function ThinkingIndicator({ status = 'Thinking...', agentState = 'idle', iteration, maxIterations, elapsed, onStop }: ThinkingIndicatorProps) {
  const isActive = agentState === 'understanding' || status?.toLowerCase().includes('thinking') || status?.toLowerCase().includes('generating');
  const textClass = isActive 
    ? 'shimmer-text font-bold tracking-wide' 
    : agentState === 'awaiting_tool_approval' 
      ? 'text-yellow-400 animate-pulse font-semibold'
      : agentState === 'error'
        ? 'text-red-500 font-bold'
        : 'text-white/90 font-medium';

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg max-w-sm">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-gradient-to-tr from-[#4F46E5] to-[#7C3AED]"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>
      
      <div className="flex-1 flex flex-col transition-all duration-300">
        <span className={`text-sm ${textClass}`}>{status}</span>
        <div className="flex gap-2 text-xs text-white/40 font-mono">
          {iteration !== undefined && (
            <span>Step {iteration}{maxIterations ? ` of ${maxIterations}` : ''}</span>
          )}
          {elapsed !== undefined && (
            <span>• {elapsed}ms</span>
          )}
        </div>
      </div>

      {onStop && (
        <button 
          onClick={onStop}
          className="p-1.5 rounded text-red-400 hover:bg-red-500/20 transition-colors"
          title="Stop Agent"
        >
          <Square size={16} fill="currentColor" />
        </button>
      )}
    </div>
  );
}

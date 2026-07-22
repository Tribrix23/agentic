import React from 'react';
import { AIConfig } from '../../lib/aiConfig';
import { TokenBudget } from '../../lib/tokenCounter';
import { TokenUsageBar } from './TokenUsageBar';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface AgentStatusBarProps {
  tokenBudget?: TokenBudget;
  config: AIConfig;
  isAgentRunning: boolean;
  onConfigChange?: (partial: Partial<AIConfig>) => void;
}

export function AgentStatusBar({ tokenBudget, config, isAgentRunning, onConfigChange }: AgentStatusBarProps) {
  return (
    <div className="h-8 bg-[#08080c] border-t border-white/5 px-4 flex items-center justify-between text-xs text-white/50 font-mono select-none">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 cursor-pointer hover:text-white/80 transition-colors">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isAgentRunning ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : (config.agentMode ? "bg-blue-500" : "bg-white/20")
          )} />
          <span>{config.model}</span>
        </div>
        <span>T: {config.temperature}</span>
      </div>
      
      <div className="flex-1 max-w-xs ml-4">
        {tokenBudget && <TokenUsageBar budget={tokenBudget} />}
      </div>
    </div>
  );
}

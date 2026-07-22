import React from 'react';
import { TokenBudget } from '../../lib/tokenCounter';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface TokenUsageBarProps {
  budget?: TokenBudget;
}

export function TokenUsageBar({ budget }: TokenUsageBarProps) {
  if (!budget) return null;
  
  const total = budget.total;
  
  const getWidth = (val: number) => `${(val / total) * 100}%`;
  
  return (
    <div className="w-full group relative flex items-center h-4 rounded overflow-hidden bg-white/5 border border-white/5">
      <div style={{ width: getWidth(budget.systemPrompt) }} className="h-full bg-purple-500/80 transition-all" title={`System: ${budget.systemPrompt}`} />
      <div style={{ width: getWidth(budget.tools) }} className="h-full bg-blue-500/80 transition-all" title={`Tools: ${budget.tools}`} />
      <div style={{ width: getWidth(budget.projectContext) }} className="h-full bg-cyan-500/80 transition-all" title={`Context: ${budget.projectContext}`} />
      <div style={{ width: getWidth(budget.conversationHistory) }} className="h-full bg-green-500/80 transition-all" title={`History: ${budget.conversationHistory}`} />
      <div style={{ width: getWidth(budget.responseReserved) }} className="h-full bg-orange-500/80 transition-all" title={`Reserved: ${budget.responseReserved}`} />
      
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-[10px] font-bold text-white">
        {budget.utilizationPercent.toFixed(1)}% Used
      </div>
    </div>
  );
}

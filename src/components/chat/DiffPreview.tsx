import React from 'react';
import { Check, X } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface DiffPreviewProps {
  diff: string;
  filePath?: string;
  language?: string;
  onApply?: () => void;
  onDiscard?: () => void;
}

export function DiffPreview({ diff, filePath, language, onApply, onDiscard }: DiffPreviewProps) {
  const lines = diff.split('\n');
  
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f13] overflow-hidden flex flex-col w-full max-w-3xl">
      {filePath && (
        <div className="px-4 py-2 border-b border-white/10 bg-[#141419] flex justify-between items-center text-sm">
          <span className="font-mono text-white/70">{filePath}</span>
          {(onApply || onDiscard) && (
            <div className="flex gap-2">
              {onDiscard && (
                <button onClick={onDiscard} className="text-white/40 hover:text-red-500 transition-colors">
                  <X size={16} />
                </button>
              )}
              {onApply && (
                <button onClick={onApply} className="text-white/40 hover:text-green-500 transition-colors">
                  <Check size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto p-4 text-sm font-mono leading-relaxed">
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isSub = line.startsWith('-');
          return (
            <div 
              key={i} 
              className={cn(
                "px-2 rounded-sm whitespace-pre",
                isAdd && "bg-green-500/20 text-green-300",
                isSub && "bg-red-500/20 text-red-300",
                !isAdd && !isSub && "text-white/60"
              )}
            >
              <span className="select-none inline-block w-8 text-right mr-4 opacity-50 text-xs">
                {i + 1}
              </span>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

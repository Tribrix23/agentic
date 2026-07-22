import React from 'react';
import { File, X } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface FileContextBadgeProps {
  filePath: string;
  onRemove?: () => void;
}

export function FileContextBadge({ filePath, onRemove }: FileContextBadgeProps) {
  const basename = filePath.split(/[/\\]/).pop() || filePath;
  
  return (
    <div 
      className="group flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1c1c21] border border-white/10 text-xs font-mono text-white/70 relative cursor-default"
      title={filePath}
    >
      <File size={12} className="text-blue-400" />
      <span>{basename}</span>
      {onRemove && (
        <button 
          onClick={onRemove}
          className="p-0.5 rounded-full hover:bg-white/10 hover:text-white transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

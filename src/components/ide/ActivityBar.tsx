import React from 'react';
import { Boxes, Files, GitBranch } from 'lucide-react';

import { Tooltip } from "../ui/Tooltip";

export type SidebarView = 'explorer' | 'source-control' | 'environment';

interface ActivityBarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  gitChangesCount?: number;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeView, onViewChange, gitChangesCount = 0 }) => {
  return (
    <div className="w-[52px] bg-[#08080c] flex flex-col items-center py-4 gap-6 border-r border-white/5 z-20 flex-shrink-0">
      <Tooltip content="Explorer" position="right">
        <button 
          onClick={() => onViewChange('explorer')}
          className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'explorer' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}
        >
          <Files size={22} strokeWidth={1.5} />
          {activeView === 'explorer' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
        </button>
      </Tooltip>
      <Tooltip content="Environment and Libraries" position="right">
        <button
          aria-label="Environment and Libraries"
          onClick={() => onViewChange('environment')}
          className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'environment' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}>
          <Boxes size={22} strokeWidth={1.5} />
          {activeView === 'environment' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
        </button>
      </Tooltip>
      <Tooltip content="Source Control" position="right">
        <button 
          onClick={() => onViewChange('source-control')}
          className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'source-control' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}
        >
          <div className="relative">
            <GitBranch size={22} strokeWidth={1.5} />
            {gitChangesCount > 0 && (
              <div className="absolute -bottom-1.5 -right-2 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center shadow-sm">
                {gitChangesCount}
              </div>
            )}
          </div>
          {activeView === 'source-control' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
        </button>
      </Tooltip>
    </div>
  );
};

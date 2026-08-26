import React from 'react';
import { Boxes, Files, GitBranch } from 'lucide-react';

export type SidebarView = 'explorer' | 'source-control' | 'environment';

interface ActivityBarProps {
  activeView: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({ activeView, onViewChange }) => {
  return (
    <div className="w-[52px] bg-[#08080c] flex flex-col items-center py-4 gap-6 border-r border-white/5 z-20 flex-shrink-0">
      <button 
        onClick={() => onViewChange('explorer')}
        className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'explorer' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}
      >
        <Files size={22} strokeWidth={1.5} />
        {activeView === 'explorer' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
      </button>
      <button
        title="Environment and Libraries"
        aria-label="Environment and Libraries"
        onClick={() => onViewChange('environment')}
        className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'environment' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}
      >
        <Boxes size={22} strokeWidth={1.5} />
        {activeView === 'environment' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
      </button>
      <button 
        onClick={() => onViewChange('source-control')}
        className={`transition-colors relative group w-full flex justify-center cursor-pointer ${activeView === 'source-control' ? 'text-white' : 'text-[#5b5b63] hover:text-white'}`}
      >
        <GitBranch size={22} strokeWidth={1.5} />
        {activeView === 'source-control' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />}
      </button>
    </div>
  );
};

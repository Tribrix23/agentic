import React from 'react';
import { FileCode, FileJson, Copy, CheckSquare, X, PanelRightClose } from 'lucide-react';
import { cn } from '../App';

export const RightSidebar = ({ isOpen, toggle }: { isOpen: boolean, toggle: () => void }) => {
  return (
    <div className={cn(
      "h-full bg-[#0f0f13] border-white/5 flex flex-col flex-shrink-0 z-10 select-none transition-all duration-300 ease-in-out overflow-hidden",
      isOpen ? "w-[450px] border-l" : "w-0 border-l-0"
    )}>
      <div className="w-[450px] h-full flex flex-col pt-10">
        {/* Empty Area */}
        <div className="flex-1 bg-[#08080c]" />
      </div>
    </div>
  );
};

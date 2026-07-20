import React from 'react';
import { Files, GitBranch } from 'lucide-react';

export const ActivityBar: React.FC = () => {
  return (
    <div className="w-[52px] bg-[#08080c] flex flex-col items-center py-4 gap-6 border-r border-white/5 z-20 flex-shrink-0">
      <button className="text-white hover:text-white transition-colors relative group w-full flex justify-center cursor-pointer">
        <Files size={22} strokeWidth={1.5} />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />
      </button>
      <button className="text-[#5b5b63] hover:text-white transition-colors relative group w-full flex justify-center cursor-pointer">
        <GitBranch size={22} strokeWidth={1.5} />
      </button>
    </div>
  );
};

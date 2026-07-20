import React from 'react';
import { Plus, Clock, Calendar, Settings } from 'lucide-react';
import { cn } from '../App';

export const Sidebar = ({ isOpen, onOpenSettings }: { isOpen: boolean, onOpenSettings: () => void }) => {
  return (
    <div className={cn(
      "h-full bg-[#0f0f13] border-white/5 flex flex-col flex-shrink-0 z-10 select-none transition-all duration-300 ease-in-out overflow-hidden",
      isOpen ? "w-[260px] border-r" : "w-0 border-r-0"
    )}>
      <div className="w-[260px] h-full flex flex-col pt-10 pb-4">
        {/* Top Header / App Title */}
        <div className="px-4 mb-6">
          <h1 className="text-white font-bold tracking-widest text-[16px] flex items-center gap-2">
            AGENTIC CODER
          </h1>
        </div>

        {/* New Conversation Button */}
        <div className="px-4 mb-6">
          <button className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors text-sm font-medium text-white">
            <Plus size={16} className="text-[#a8a8b1]" />
            New Conversation
          </button>
        </div>

        {/* Primary Navigation */}
        <div className="px-2 mb-8 flex flex-col gap-1">
          <NavItem icon={<Clock size={16} />} label="Conversation History" />
          <NavItem icon={<Calendar size={16} />} label="Scheduled Tasks" />
        </div>
        
        <div className="flex-1" />

        {/* Bottom Settings */}
        <div className="px-4 mt-auto pt-4 border-t border-white/5">
          <button 
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 text-[#a8a8b1] hover:text-white transition-colors text-sm font-medium"
          >
            <Settings size={16} />
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => {
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
      active ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:bg-white/5 hover:text-white"
    )}>
      {icon}
      <span className="font-medium">{label}</span>
    </div>
  );
};

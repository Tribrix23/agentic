import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Clock, Folder, ArrowRight } from 'lucide-react';
import { cn } from '../App';

interface ProjectFolder {
  path: string;
  name: string;
  branch: string | null;
}

interface ConversationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectFolder[];
  conversations: Record<string, { id: string, title: string }[]>;
  onSelectConversation: (projPath: string, convId: string, title: string) => void;
}

export const ConversationHistoryModal: React.FC<ConversationHistoryModalProps> = ({
  isOpen,
  onClose,
  projects,
  conversations,
  onSelectConversation
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const allConvos: { project: ProjectFolder, conv: { id: string, title: string } }[] = [];
    
    projects.forEach(proj => {
      const projConvos = conversations[proj.path] || [];
      projConvos.forEach(conv => {
        allConvos.push({ project: proj, conv });
      });
    });

    if (!searchQuery.trim()) return allConvos;
    
    const lowerQuery = searchQuery.toLowerCase();
    return allConvos.filter(c => 
      c.conv.title.toLowerCase().includes(lowerQuery) || 
      c.project.name.toLowerCase().includes(lowerQuery)
    );
  }, [projects, conversations, searchQuery]);

  // Reset search when opened
  React.useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Handle ESC key
  React.useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center region-no-drag">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="w-[640px] h-[480px] flex flex-col bg-[#0f0f13]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.7)] overflow-hidden relative z-10"
          >
            {/* Spotlight Search Header */}
            <div className="flex items-center px-5 py-4 border-b border-white/[0.08] bg-transparent">
              <Search size={22} className="text-[#8b8b93] mr-4" />
              <input
                autoFocus
                type="text"
                placeholder="Search conversation history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[#e4e4e7] text-[17px] outline-none placeholder:text-[#5b5b63]"
              />
              <button
                onClick={onClose}
                className="p-1.5 text-[#8b8b93] hover:text-[#e4e4e7] hover:bg-white/10 rounded-lg transition-colors ml-2"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {filteredConversations.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {filteredConversations.map((item) => (
                    <button
                      key={`${item.project.path}-${item.conv.id}`}
                      onClick={() => onSelectConversation(item.project.path, item.conv.id, item.conv.title)}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/[0.06] focus:bg-white/[0.06] outline-none flex items-center justify-between group transition-all"
                    >
                      <div className="flex flex-col gap-1.5 overflow-hidden pr-4">
                        <span className="text-[15px] font-medium text-[#d4d4d8] group-hover:text-white transition-colors truncate">
                          {item.conv.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-[12px] text-[#6b6b73]">
                          <Folder size={12} className="text-[#5b5b63]" />
                          <span className="truncate">{item.project.name}</span>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-[#5b5b63] opacity-0 group-hover:opacity-100 group-hover:text-white transition-all transform group-hover:translate-x-1 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-[#5b5b63]">
                  <Clock size={42} className="opacity-20 mb-4" />
                  <p className="text-[15px] font-medium text-[#8b8b93]">No conversations found</p>
                  {searchQuery && <p className="text-[13px] mt-1.5 opacity-60">Try a different search term</p>}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="px-5 py-3 bg-[#0a0a0c]/80 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-[11px] text-[#5b5b63] uppercase tracking-widest font-semibold">
                {filteredConversations.length} {filteredConversations.length === 1 ? 'Result' : 'Results'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#5b5b63] font-medium">ESC</span>
                <span className="text-[11px] text-[#4b4b53]">to close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

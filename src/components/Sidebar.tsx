import React, { useState, useRef, useEffect } from 'react';
import { Plus, Clock, Calendar, Settings, FolderPlus, Folder, FolderOpen, GitBranch, Trash2 } from 'lucide-react';
import { cn } from '../App';
import { AnimatePresence, motion } from 'framer-motion';

interface ProjectFolder {
  path: string;
  name: string;
  branch: string | null;
}

export const Sidebar = ({ isOpen, onOpenSettings }: { isOpen: boolean, onOpenSettings: () => void }) => {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  
  const [projects, setProjects] = useState<ProjectFolder[]>(() => {
    const saved = localStorage.getItem('quantix_projects');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeProject, setActiveProject] = useState<ProjectFolder | null>(() => {
    const saved = localStorage.getItem('quantix_active_project');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    // Poll for changes in case MainContent updates local storage
    const interval = setInterval(() => {
      const saved = localStorage.getItem('quantix_projects');
      if (saved) {
        setProjects(JSON.parse(saved));
      }
      const savedActive = localStorage.getItem('quantix_active_project');
      if (savedActive) {
        setActiveProject(JSON.parse(savedActive));
      }
    }, 1000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleDeleteProject = (pathToDelete: string) => {
    const updatedProjects = projects.filter(p => p.path !== pathToDelete);
    setProjects(updatedProjects);
    localStorage.setItem('quantix_projects', JSON.stringify(updatedProjects));
    
    if (activeProject?.path === pathToDelete) {
      const nextActive = updatedProjects.length > 0 ? updatedProjects[0] : null;
      setActiveProject(nextActive);
      if (nextActive) {
        localStorage.setItem('quantix_active_project', JSON.stringify(nextActive));
      } else {
        localStorage.removeItem('quantix_active_project');
      }
    }
  };

  return (
    <div className={cn(
      "h-full bg-[#0f0f13] border-white/5 flex flex-col flex-shrink-0 z-10 select-none transition-all duration-300 ease-in-out overflow-visible",
      isOpen ? "w-[260px] border-r" : "w-0 border-r-0"
    )}>
      <div className="w-[260px] h-full flex flex-col pt-10 pb-4 relative">
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

        {/* Projects Header */}
        <div className="px-4 mb-2 flex items-center justify-between group">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6b6b73]">Projects</span>
          <button 
            className="p-1 text-[#737373] hover:text-white transition-colors" 
            onClick={() => window.dispatchEvent(new CustomEvent('open-add-project-wizard'))}
            title="Add Project"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Project List */}
        <motion.div 
          className="px-2 flex-1 overflow-y-auto flex flex-col gap-[2px]"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.05 }
            }
          }}
        >
          {projects.map((proj) => {
            const isExpanded = expandedProjects.has(proj.path);
            
            return (
            <motion.div 
              key={proj.path} 
              className="flex flex-col"
              variants={{
                hidden: { opacity: 0, y: -5 },
                show: { opacity: 1, y: 0 }
              }}
            >
              <div className="flex items-center group/proj relative">
                <button
                  onClick={() => {
                    const newSet = new Set(expandedProjects);
                    if (newSet.has(proj.path)) newSet.delete(proj.path);
                    else newSet.add(proj.path);
                    setExpandedProjects(newSet);
                    
                    setActiveProject(proj);
                    localStorage.setItem('quantix_active_project', JSON.stringify(proj));
                  }}
                  className="flex-1 px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors truncate rounded-md text-[#a8a8b1] hover:text-[#d4d4d8]"
                >
                  {isExpanded ? (
                    <FolderOpen size={14} className="shrink-0 text-[#8b8b93] group-hover/proj:text-[#a8a8b1]" />
                  ) : (
                    <Folder size={14} className="shrink-0 text-[#8b8b93] group-hover/proj:text-[#a8a8b1]" />
                  )}
                  <span className="truncate">{proj.name}</span>
                  
                  {proj.branch && (
                    <span className="flex items-center gap-0.5 text-[9px] text-[#6b6b73] bg-white/5 px-1 py-0.5 rounded shrink-0 ml-auto">
                      <GitBranch size={9} />
                      {proj.branch}
                    </span>
                  )}
                </button>
                
                <div className="absolute right-2 flex items-center gap-1 opacity-0 group-hover/proj:opacity-100 transition-opacity bg-[#0f0f13] pl-2">
                  <button 
                    className="p-1 text-[#8b8b93] hover:text-white rounded transition-colors" 
                    title="Settings"
                    onClick={(e) => {
                      e.stopPropagation();
                      localStorage.setItem('quantix_settings_initial_tab', `project-${proj.path}`);
                      onOpenSettings();
                    }}
                  >
                    <Settings size={13} />
                  </button>
                  <button className="p-1 text-[#8b8b93] hover:text-white rounded transition-colors" title="New Conversation">
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* Expanded Conversations */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col overflow-hidden"
                  >
                    <div className="mb-2 ml-[9px] pl-4 border-l border-white/5">
                      <div className="py-2 pl-2 text-xs text-[#5b5b63]">
                        No conversations yet
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            );
          })}
        </motion.div>

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

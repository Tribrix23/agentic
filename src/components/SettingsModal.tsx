import React, { useEffect, useState, useRef } from 'react';
import { X, MessageSquare, Search, Edit3, SquarePlus, ArrowLeft, ArrowRight, Clock, Settings, Command, Layout, Trash2, Folder, GitBranch, Plus, ChevronDown, Info, ShieldCheck, ExternalLink, Pencil, Cpu, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../App';
import { getAIConfig, setAIConfig, resetAIConfig, AI_PARAM_RANGES, getAvailableModels, AIConfig } from '../lib/aiConfig';

interface ProjectFolder {
  path: string;
  name: string;
  branch: string | null;
}

const CustomSelect = ({ value, onChange, options }: { value: string, onChange: (val: string) => void, options: string[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black/40 border border-white/10 hover:border-white/20 text-xs text-white rounded-lg px-3 py-2 min-w-[140px] flex items-center justify-between gap-2 outline-none transition-colors shadow-inner"
      >
        <span>{value}</span>
        <ChevronDown size={14} className={cn("text-[#8b8b93] transition-transform", isOpen ? "rotate-180" : "")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-[140px] bg-[#141419] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 py-1"
          >
            {options.map(opt => (
              <div 
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={cn(
                  "px-3 py-2 text-xs cursor-pointer transition-colors flex items-center gap-2",
                  value === opt ? "bg-[#3b82f6]/10 text-[#3b82f6]" : "text-[#8b8b93] hover:bg-white/5 hover:text-white"
                )}
              >
                {value === opt && <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />}
                <span className={cn(value !== opt && "ml-3")}>{opt}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SliderSetting = ({ 
  label, description, min, max, step, value, onChange 
}: { 
  label: string; description?: string; min: number; max: number; step: number; value: number; onChange: (val: number) => void;
}) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/[0.07] transition-colors">
    <div className="flex flex-col">
      <span className="text-white font-medium text-[14px]">{label}</span>
      {description && <span className="text-[#8b8b93] text-[13px] mt-1">{description}</span>}
    </div>
    <div className="flex items-center gap-4">
      <input 
        type="range" min={min} max={max} step={step} value={value} 
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 bg-black/40 rounded-full appearance-none outline-none accent-[#7C3AED]"
      />
      <input 
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-20 bg-[#1c1c21] border border-white/10 text-white text-xs px-2 py-1 rounded outline-none"
      />
    </div>
  </div>
);

const ToggleSetting = ({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (val: boolean) => void }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between gap-4 hover:bg-white/[0.07] transition-colors cursor-pointer" onClick={() => onChange(!checked)}>
    <div className="flex flex-col flex-1">
      <span className="text-white font-medium text-[14px]">{label}</span>
      {description && <span className="text-[#8b8b93] text-[13px] mt-1">{description}</span>}
    </div>
    <div className={cn("w-10 h-5 rounded-full flex items-center p-0.5 transition-colors", checked ? "bg-[#7C3AED]" : "bg-white/20")}>
      <div className={cn("w-4 h-4 rounded-full transition-transform", checked ? "translate-x-5 bg-white" : "translate-x-0 bg-white/70")} />
    </div>
  </div>
);

export const SettingsModal = ({ 
  user, 
  onClose, 
  onLogout 
}: { 
  user: { name: string, avatar: string, email?: string, token?: string },
  onClose: () => void,
  onLogout: () => void 
}) => {
  const [email, setEmail] = useState<string>('Loading...');
  const [activeTab, setActiveTab] = useState(() => {
    const tab = localStorage.getItem('quantix_settings_initial_tab');
    if (tab) {
      localStorage.removeItem('quantix_settings_initial_tab');
      return tab;
    }
    return 'account';
  });
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  
  const [aiConfig, setLocalAIConfig] = useState<AIConfig>(() => getAIConfig());
  const [stopSequenceInput, setStopSequenceInput] = useState("");
  
  const handleAIConfigChange = (partial: Partial<AIConfig>) => {
    const newConfig = setAIConfig(partial);
    setLocalAIConfig(newConfig);
  };
  
  // Per-project states
  const [projectSettings, setProjectSettings] = useState<Record<string, any>>({});
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem('quantix_projects');
    if (saved) {
      try {
        setProjects(JSON.parse(saved));
      } catch(e) {}
    }
    const savedSettings = localStorage.getItem('quantix_project_settings');
    if (savedSettings) {
      try {
        setProjectSettings(JSON.parse(savedSettings));
      } catch(e) {}
    }
  }, []);

  const updateProjectSetting = (projectPath: string, key: string, value: string) => {
    const updated = {
      ...projectSettings,
      [projectPath]: {
        ...(projectSettings[projectPath] || {}),
        [key]: value
      }
    };
    setProjectSettings(updated);
    localStorage.setItem('quantix_project_settings', JSON.stringify(updated));
  };

  useEffect(() => {
    async function fetchEmail() {
      if (!user.token) {
        setEmail('No token provided');
        return;
      }
      try {
        const result = await (window as any).electron.fetchSupabaseEmail(user.token);
        
        if (result.error) {
          console.error('Error fetching email via IPC:', result.error);
          setEmail('Error: ' + result.error);
        } else if (result.email) {
          setEmail(result.email);
        } else {
          setEmail('No email found');
        }
      } catch (err: any) {
        console.error('Unexpected error fetching email:', err);
        setEmail('Error: ' + (err.message || String(err)));
      }
    }
    fetchEmail();
  }, [user.token]);

  const selectedProject = projects.find(p => `project-${p.path}` === activeTab);

  const handleDeleteProject = (pathToDelete: string) => {
    const updated = projects.filter(p => p.path !== pathToDelete);
    setProjects(updated);
    localStorage.setItem('quantix_projects', JSON.stringify(updated));
    const active = localStorage.getItem('quantix_active_project');
    if (active) {
      const parsed = JSON.parse(active);
      if (parsed.path === pathToDelete) {
        localStorage.removeItem('quantix_active_project');
      }
    }
    setActiveTab('account');
    setShowConfirmDelete(false);
  };

  const getHeaderInfo = () => {
    if (activeTab === 'account') {
      return { title: 'Account', subtitle: 'Manage your plan, credentials, and general preferences.' };
    }
    if (activeTab === 'shortcuts') {
      return { title: 'Shortcuts', subtitle: 'Keyboard shortcuts for quick navigation and control.' };
    }
    if (activeTab === 'ai_settings') {
      return { title: 'AI Settings', subtitle: 'Configure underlying model parameters and API settings.' };
    }
    if (activeTab === 'agent_settings') {
      return { title: 'Agent Settings', subtitle: 'Manage agent behavior, limits, and review policies.' };
    }
    if (selectedProject) {
      return { title: selectedProject.name, subtitle: 'Manage project folders, agent settings, and permissions.' };
    }
    return { title: 'Settings', subtitle: '' };
  };

  const headerInfo = getHeaderInfo();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-5xl h-[80vh] bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl flex overflow-hidden"
      >
        
        {/* Sidebar */}
        <div className="w-64 border-r border-white/5 p-4 flex flex-col gap-1 overflow-y-auto bg-[#141419]">
          <div className="text-[11px] font-semibold text-[#8b8b93] px-3 mb-1 uppercase tracking-wider">General</div>
          <button 
            onClick={() => setActiveTab('account')}
            className={cn("w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors", activeTab === 'account' ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
          >
            Account
          </button>
          <button 
            onClick={() => setActiveTab('ai_settings')}
            className={cn("w-full text-left px-3 py-2 flex items-center gap-2 rounded-lg text-[13px] font-medium transition-colors", activeTab === 'ai_settings' ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
          >
            <Cpu size={14} className="shrink-0" />
            AI Settings
          </button>
          <button 
            onClick={() => setActiveTab('agent_settings')}
            className={cn("w-full text-left px-3 py-2 flex items-center gap-2 rounded-lg text-[13px] font-medium transition-colors", activeTab === 'agent_settings' ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
          >
            <Bot size={14} className="shrink-0" />
            Agent Settings
          </button>
          
          <div className="text-[11px] font-semibold text-[#8b8b93] px-3 mt-6 mb-1 uppercase tracking-wider">Projects</div>
          {projects.map(p => (
            <button 
              key={p.path} 
              onClick={() => setActiveTab(`project-${p.path}`)}
              className={cn("w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors truncate flex items-center gap-2", activeTab === `project-${p.path}` ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
            >
              <Folder size={14} className="text-[#8b8b93] shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          
          <div className="mt-auto pt-8 flex flex-col gap-1">
            <button 
              onClick={() => setActiveTab('shortcuts')}
              className={cn("w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors", activeTab === 'shortcuts' ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
            >
              Shortcuts
            </button>
            <button className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors">Provide Feedback</button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f13]">
          <div className="flex items-start justify-between p-8 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-white mb-1">{headerInfo.title}</h2>
                {selectedProject && (
                  <button className="text-[#8b8b93] hover:text-white transition-colors p-1 rounded">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="text-[#8b8b93] text-sm">{headerInfo.subtitle}</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-[#8b8b93] hover:text-white hover:bg-white/5 rounded-md transition-colors -mr-2 -mt-2"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-8 pt-2 overflow-y-auto flex-1 custom-scrollbar">
            {activeTab === 'account' && (
              <>
                <h3 className="text-white font-semibold text-[15px] mb-3">General</h3>
                
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden mb-8">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-[14px]">Marketing Emails</span>
                      <span className="text-[#8b8b93] text-[13px]">Receive product updates, tips, and promotions from Quantix via email.</span>
                    </div>
                    <div 
                      onClick={() => setMarketingEmails(!marketingEmails)} 
                      className={cn("w-10 h-5 rounded-full flex items-center p-0.5 cursor-pointer transition-colors", marketingEmails ? "bg-white" : "bg-white/20")}
                    >
                      <div className={cn("w-4 h-4 rounded-full transition-transform", marketingEmails ? "translate-x-5 bg-black" : "translate-x-0 bg-white")} />
                    </div>
                  </div>
                </div>

                <h3 className="text-white font-semibold text-[15px] mb-3">Account</h3>
                
                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-[14px]">Your Plan: Quantix Basic</span>
                      <span className="text-[#8b8b93] text-[13px]">You can upgrade to a Quantix Pro plan to receive higher rate limits.</span>
                    </div>
                    <button className="bg-[#688bf8] hover:bg-[#5b7be3] text-white px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors">
                      Upgrade
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-[14px]">Email</span>
                      <span className="text-[#8b8b93] text-[13px]">{email}</span>
                    </div>
                    <button 
                      onClick={onLogout}
                      className="bg-white/5 hover:bg-white/10 text-[#a8a8b1] hover:text-white px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors border border-white/5"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
                
                <p className="mt-8 text-[12px] text-[#8b8b93]">
                  By using this app, you agree to its{' '}
                  <button 
                    onClick={() => {
                      if ((window as any).electron?.openExternal) {
                        (window as any).electron.openExternal('https://quantix.devctr.com/terms-and-conditions');
                      } else {
                        window.open('https://quantix.devctr.com/terms-and-conditions', '_blank');
                      }
                    }}
                    className="text-[#3b82f6] hover:underline cursor-pointer bg-transparent border-none p-0 inline font-inherit"
                  >
                    Terms of Service
                  </button>
                </p>
              </>
            )}

            {activeTab === 'shortcuts' && (
              <div className="flex flex-col gap-6">
                
                {/* RECOMMENDED */}
                <div>
                  <div className="text-[11px] font-semibold text-[#8b8b93] mb-3 uppercase tracking-wider">
                    Recommended
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <MessageSquare size={14} className="text-[#8b8b93]" />
                        <span>Open Conversation Picker</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">K</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Search size={14} className="text-[#8b8b93]" />
                        <span>Open File Search</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">P</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Edit3 size={14} className="text-[#8b8b93]" />
                        <span>Focus Input</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">L</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <SquarePlus size={14} className="text-[#8b8b93]" />
                        <span>New Conversation</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">N</kbd>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NAVIGATION */}
                <div>
                  <div className="text-[11px] font-semibold text-[#8b8b93] mb-3 uppercase tracking-wider">
                    Navigation
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <ArrowLeft size={14} className="text-[#8b8b93]" />
                        <span>Go Back</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">[</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <ArrowRight size={14} className="text-[#8b8b93]" />
                        <span>Go Forward</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">]</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Search size={14} className="text-[#8b8b93]" />
                        <span>File Picker</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">P</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <SquarePlus size={14} className="text-[#8b8b93]" />
                        <span>New Conversation</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">N</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <MessageSquare size={14} className="text-[#8b8b93]" />
                        <span>Open Conversation Picker</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">K</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Clock size={14} className="text-[#8b8b93]" />
                        <span>Scheduled Tasks</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">U</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3] pl-6">
                        <span>Select Previous Conversation</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Alt</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">↑</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3] pl-6">
                        <span>Select Next Conversation</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Alt</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">↓</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Settings size={14} className="text-[#8b8b93]" />
                        <span>Open Settings</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">,</kbd>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GENERAL & MORE */}
                <div>
                  <div className="text-[11px] font-semibold text-[#8b8b93] mb-3 uppercase tracking-wider">
                    General & View
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Layout size={14} className="text-[#8b8b93]" />
                        <span>Toggle Sidebar</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">B</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Command size={14} className="text-[#8b8b93]" />
                        <span>Command Palette</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Shift</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">P</kbd>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3 text-xs text-[#e2e2e3]">
                        <Trash2 size={14} className="text-[#8b8b93]" />
                        <span>Clear Active Chat</span>
                      </div>
                      <div className="flex gap-1">
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Ctrl</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">Shift</kbd>
                        <kbd className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-mono text-[#a8a8b1]">L</kbd>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'ai_settings' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Model</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start justify-between gap-4 hover:bg-white/[0.07] transition-colors">
                    <div className="flex flex-col flex-1">
                      <span className="text-white font-medium text-[14px]">Model Selection</span>
                      <span className="text-[#8b8b93] text-[13px] mt-1">Choose the AI model for generations. Context window: {aiConfig.contextWindowSize}</span>
                    </div>
                    <CustomSelect 
                      value={aiConfig.model}
                      onChange={val => handleAIConfigChange({ model: val })}
                      options={getAvailableModels()}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Parameters</h3>
                  <div className="flex flex-col gap-4">
                    <ToggleSetting 
                      label="Dynamic Task Parameters" 
                      description="Quantix will automatically tune temperature, top P, and top K based on the complexity and nature of your task." 
                      checked={aiConfig.dynamicParameters ?? true} 
                      onChange={val => handleAIConfigChange({ dynamicParameters: val })} 
                    />
                    
                    <div className={cn("flex flex-col gap-4 transition-opacity", (aiConfig.dynamicParameters ?? true) ? "opacity-50 pointer-events-none" : "opacity-100")}>
                      <SliderSetting 
                      label="Temperature" description={AI_PARAM_RANGES.temperature.description}
                      min={AI_PARAM_RANGES.temperature.min} max={AI_PARAM_RANGES.temperature.max} step={AI_PARAM_RANGES.temperature.step}
                      value={aiConfig.temperature} onChange={val => handleAIConfigChange({ temperature: val })}
                    />
                    <SliderSetting 
                      label="Top P" description={AI_PARAM_RANGES.topP.description}
                      min={AI_PARAM_RANGES.topP.min} max={AI_PARAM_RANGES.topP.max} step={AI_PARAM_RANGES.topP.step}
                      value={aiConfig.topP} onChange={val => handleAIConfigChange({ topP: val })}
                    />
                    <SliderSetting 
                      label="Top K" description={AI_PARAM_RANGES.topK.description}
                      min={AI_PARAM_RANGES.topK.min} max={AI_PARAM_RANGES.topK.max} step={AI_PARAM_RANGES.topK.step}
                      value={aiConfig.topK} onChange={val => handleAIConfigChange({ topK: val })}
                    />
                    <SliderSetting 
                      label="Max Tokens" description={AI_PARAM_RANGES.maxTokens.description}
                      min={AI_PARAM_RANGES.maxTokens.min} max={AI_PARAM_RANGES.maxTokens.max} step={AI_PARAM_RANGES.maxTokens.step}
                      value={aiConfig.maxTokens} onChange={val => handleAIConfigChange({ maxTokens: val })}
                    />
                    <SliderSetting 
                      label="Frequency Penalty" description={AI_PARAM_RANGES.frequencyPenalty.description}
                      min={AI_PARAM_RANGES.frequencyPenalty.min} max={AI_PARAM_RANGES.frequencyPenalty.max} step={AI_PARAM_RANGES.frequencyPenalty.step}
                      value={aiConfig.frequencyPenalty} onChange={val => handleAIConfigChange({ frequencyPenalty: val })}
                    />
                    <SliderSetting 
                      label="Presence Penalty" description={AI_PARAM_RANGES.presencePenalty.description}
                      min={AI_PARAM_RANGES.presencePenalty.min} max={AI_PARAM_RANGES.presencePenalty.max} step={AI_PARAM_RANGES.presencePenalty.step}
                      value={aiConfig.presencePenalty} onChange={val => handleAIConfigChange({ presencePenalty: val })}
                    />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Output</h3>
                  <div className="flex flex-col gap-4">
                    <ToggleSetting label="Streaming" description="Stream response chunks as they arrive." checked={aiConfig.stream} onChange={val => handleAIConfigChange({ stream: val })} />
                    <SliderSetting label="Stream Chunk Delay" description={AI_PARAM_RANGES.streamChunkDelay.description} min={AI_PARAM_RANGES.streamChunkDelay.min} max={AI_PARAM_RANGES.streamChunkDelay.max} step={AI_PARAM_RANGES.streamChunkDelay.step} value={aiConfig.streamChunkDelay} onChange={val => handleAIConfigChange({ streamChunkDelay: val })} />
                    
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start justify-between gap-4 hover:bg-white/[0.07] transition-colors">
                      <div className="flex flex-col flex-1">
                        <span className="text-white font-medium text-[14px]">Response Format</span>
                      </div>
                      <CustomSelect value={aiConfig.responseFormat} onChange={val => handleAIConfigChange({ responseFormat: val as any })} options={['text', 'json']} />
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/[0.07] transition-colors">
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-[14px]">Stop Sequences</span>
                        <span className="text-[#8b8b93] text-[13px] mt-1">Press Enter to add.</span>
                      </div>
                      <input 
                        type="text" value={stopSequenceInput} onChange={e => setStopSequenceInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && stopSequenceInput.trim()) {
                            e.preventDefault();
                            if (!aiConfig.stopSequences.includes(stopSequenceInput.trim())) {
                              handleAIConfigChange({ stopSequences: [...aiConfig.stopSequences, stopSequenceInput.trim()] });
                            }
                            setStopSequenceInput("");
                          }
                        }}
                        className="bg-[#1c1c21] border border-white/10 text-white text-sm px-3 py-2 rounded-lg outline-none"
                        placeholder="Add stop sequence..."
                      />
                      {aiConfig.stopSequences.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {aiConfig.stopSequences.map(seq => (
                            <div key={seq} className="flex items-center gap-1 bg-[#7C3AED]/20 text-[#7C3AED] px-2 py-1 rounded text-xs">
                              <span>{seq}</span>
                              <X size={12} className="cursor-pointer hover:text-white" onClick={() => handleAIConfigChange({ stopSequences: aiConfig.stopSequences.filter(s => s !== seq) })} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Limits & Retries</h3>
                  <div className="flex flex-col gap-4">
                    <SliderSetting label="Max Conversation Turns" description={AI_PARAM_RANGES.maxConversationTurns.description} min={AI_PARAM_RANGES.maxConversationTurns.min} max={AI_PARAM_RANGES.maxConversationTurns.max} step={AI_PARAM_RANGES.maxConversationTurns.step} value={aiConfig.maxConversationTurns} onChange={val => handleAIConfigChange({ maxConversationTurns: val })} />
                    <SliderSetting label="Request Timeout (s)" description="Timeout in seconds." min={AI_PARAM_RANGES.timeoutMs.min/1000} max={AI_PARAM_RANGES.timeoutMs.max/1000} step={1} value={aiConfig.timeoutMs / 1000} onChange={val => handleAIConfigChange({ timeoutMs: val * 1000 })} />
                    <SliderSetting label="Max Retries" description={AI_PARAM_RANGES.maxRetries.description} min={AI_PARAM_RANGES.maxRetries.min} max={AI_PARAM_RANGES.maxRetries.max} step={AI_PARAM_RANGES.maxRetries.step} value={aiConfig.maxRetries} onChange={val => handleAIConfigChange({ maxRetries: val })} />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button 
                    onClick={() => setLocalAIConfig(resetAIConfig())}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm transition-colors"
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'agent_settings' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Core</h3>
                  <div className="flex flex-col gap-4">
                    <ToggleSetting label="Agent Mode" description="Enable autonomous agent behavior." checked={aiConfig.agentMode} onChange={val => handleAIConfigChange({ agentMode: val })} />
                    <SliderSetting label="Max Agent Iterations" description={AI_PARAM_RANGES.maxAgentIterations.description} min={AI_PARAM_RANGES.maxAgentIterations.min} max={AI_PARAM_RANGES.maxAgentIterations.max} step={AI_PARAM_RANGES.maxAgentIterations.step} value={aiConfig.maxAgentIterations} onChange={val => handleAIConfigChange({ maxAgentIterations: val })} />
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Permissions</h3>
                  <div className="flex flex-col gap-4">
                    <ToggleSetting label="Auto-Approve Reads" checked={aiConfig.autoApproveReads} onChange={val => handleAIConfigChange({ autoApproveReads: val })} />
                    <ToggleSetting label="Auto-Approve Writes" checked={aiConfig.autoApproveWrites} onChange={val => handleAIConfigChange({ autoApproveWrites: val })} />
                    <ToggleSetting label="Require Terminal Approval" checked={aiConfig.requireApprovalForTerminal} onChange={val => handleAIConfigChange({ requireApprovalForTerminal: val })} />
                  </div>
                </div>

                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">System Prompt</h3>
                  <div className="flex flex-col gap-4">
                    <ToggleSetting label="Use Default System Prompt" description="Include the default system prompt." checked={aiConfig.useDefaultSystemPrompt} onChange={val => handleAIConfigChange({ useDefaultSystemPrompt: val })} />
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/[0.07] transition-colors">
                      <span className="text-white font-medium text-[14px]">Custom System Prompt</span>
                      <textarea 
                        value={aiConfig.systemPrompt}
                        onChange={e => handleAIConfigChange({ systemPrompt: e.target.value })}
                        className="w-full h-32 bg-[#1c1c21] border border-white/10 text-white text-sm px-3 py-2 rounded-lg outline-none font-mono resize-y"
                        placeholder="Enter custom instructions..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PER-PROJECT SETTINGS VIEW */}
            {selectedProject && (
              <div className="flex flex-col gap-6">
                
                {/* 1. Folders */}
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Folders</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                      <div className="flex items-center gap-2 text-xs text-white">
                        <Folder size={14} className="text-[#8b8b93]" />
                        <span className="font-mono">{selectedProject.name}/</span>
                        {selectedProject.branch && (
                          <span className="flex items-center gap-1 text-[10px] text-[#8b8b93] bg-white/5 px-2 py-0.5 rounded">
                            <GitBranch size={10} />
                            {selectedProject.branch}
                          </span>
                        )}
                      </div>
                      <button className="text-[#8b8b93] hover:text-white transition-colors">
                        <X size={14} />
                      </button>
                    </div>

                    <button className="w-full py-2 border border-dashed border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/5 rounded-lg flex items-center justify-center gap-2 text-xs text-[#8b8b93] hover:text-white transition-all">
                      <Plus size={14} />
                      <span>Add Folder</span>
                    </button>
                  </div>
                </div>

                {/* 2. Agent Settings */}
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Agent Settings</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start justify-between gap-4 hover:bg-white/[0.07] transition-colors">
                    <div className="flex flex-col flex-1">
                      <span className="text-white font-medium text-[14px]">Security Preset</span>
                      <span className="text-[#8b8b93] text-[13px] mt-1 leading-relaxed">
                        Choose a predefined security preset for the agent. This controls terminal auto-execution policy, and file access policy.
                      </span>
                      <span className="text-[#3b82f6] text-[12px] mt-2 flex items-center gap-1 cursor-pointer hover:underline w-fit">
                        Learn more about {projectSettings[selectedProject.path]?.securityPreset || 'Default'} <Info size={12} />
                      </span>
                    </div>
                    <CustomSelect 
                      value={projectSettings[selectedProject.path]?.securityPreset || 'Default'}
                      onChange={(val) => updateProjectSetting(selectedProject.path, 'securityPreset', val)}
                      options={['Default', 'User Guided', 'Semi Permission', 'Full Permission']}
                    />
                  </div>
                </div>

                {/* 3. Agent Behavior */}
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Agent Behavior</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start justify-between gap-4 hover:bg-white/[0.07] transition-colors">
                    <div className="flex flex-col flex-1">
                      <span className="text-white font-medium text-[14px]">Artifact Review Policy</span>
                      <span className="text-[#8b8b93] text-[13px] mt-1 leading-relaxed">
                        Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.
                      </span>
                    </div>
                    <CustomSelect 
                      value={projectSettings[selectedProject.path]?.artifactPolicy || 'Always Ask'}
                      onChange={(val) => updateProjectSetting(selectedProject.path, 'artifactPolicy', val)}
                      options={['Always Ask', 'Auto Approve', 'Never Ask']}
                    />
                  </div>
                </div>

                {/* 4. Local Permissions */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-semibold text-[15px]">Local Permissions</h3>
                  </div>
                  <p className="text-[#8b8b93] text-[12px] mb-3">
                    Inherits from <span className="text-[#3b82f6] cursor-pointer hover:underline">global settings</span>. Local permissions have higher priority. <span className="text-[#3b82f6] cursor-pointer hover:underline">Learn more</span>.
                  </p>

                  <div className="bg-white/5 border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-[14px]">File Access Rules</span>
                        <span className="text-[#8b8b93] text-[12px]">Configure allowed and denied paths for file reads and writes.</span>
                      </div>
                      <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors">
                        Open
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-[14px]">Network Access Rules</span>
                        <span className="text-[#8b8b93] text-[12px]">Configure allowed and denied URLs for reading.</span>
                      </div>
                      <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors">
                        Open
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-[14px]">Terminal Commands</span>
                          <span className="px-1.5 py-0.5 bg-white/10 text-[10px] font-mono text-[#a8a8b1] rounded-full">12</span>
                        </div>
                        <span className="text-[#8b8b93] text-[12px]">Configure allowed terminal commands.</span>
                      </div>
                      <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors">
                        Open
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-[14px]">Commands Outside Sandbox</span>
                        <span className="text-[#8b8b93] text-[12px]">Configure allowed commands outside the sandbox.</span>
                      </div>
                      <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors">
                        Open
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4">
                      <div className="flex flex-col">
                        <span className="text-white font-medium text-[14px]">MCP Tools</span>
                        <span className="text-[#8b8b93] text-[12px]">Configure external tools via Model Context Protocol.</span>
                      </div>
                      <button className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors">
                        Open
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. Customizations */}
                <div>
                  <h3 className="text-white font-semibold text-[15px] mb-3">Customizations</h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                    <p className="text-[#8b8b93] text-[13px]">
                      The breakdown below shows token usage from customizations like skills, rules, and MCP. If the budget is exceeded, large customizations will be truncated automatically.
                    </p>
                    <p className="text-xs text-white font-medium">71.5% of the customization budget is available.</p>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#3b82f6] h-full w-[28.5%]" />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2 text-xs text-[#8b8b93]">
                        <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                        <span>Skills (28.5%) 5,700</span>
                      </div>
                      <button className="text-xs text-[#3b82f6] hover:underline">
                        Show 41 breakdowns
                      </button>
                    </div>
                  </div>
                </div>

                {/* 6. Danger Zone */}
                <div>
                  <h3 className="text-red-400 font-semibold text-[15px] mb-3">Danger Zone</h3>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-white font-medium text-[14px]">Delete Project</span>
                      <span className="text-[#8b8b93] text-[13px] mt-0.5">
                        Permanently delete <strong className="text-white">{selectedProject.name}</strong> including active conversations and archived conversations.
                      </span>
                    </div>
                    <button 
                      onClick={() => setShowConfirmDelete(true)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                    >
                      Delete Project
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>

      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showConfirmDelete && selectedProject && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Delete Project</h3>
                <button 
                  onClick={() => setShowConfirmDelete(false)}
                  className="text-[#8b8b93] hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-sm text-[#8b8b93]">
                Are you sure you want to delete <strong className="text-white">{selectedProject.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteProject(selectedProject.path)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

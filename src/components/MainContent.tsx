import React, { useState, useRef, useEffect } from 'react';
import { Bot, User, Paperclip, Mic, Send, PanelLeft, ArrowLeft, ArrowRight, PanelRight, Folder, ChevronDown, Plus, HardDrive, Shield, ShieldAlert, ShieldCheck, X, GitBranch, Monitor, Lock, Trash2, PanelRightClose, PanelLeftClose, Cloud, Zap, Plug2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../App';
import { callDispatcherAPI } from '../api';

interface ProjectFolder {
  path: string;
  name: string;
  branch: string | null;
}


export const MainContent = ({ 
  user,
  toggleLeftSidebar,
  toggleRightSidebar,
  leftOpen,
  rightOpen,
  onOpenIde
}: { 
  user: { name: string, avatar: string },
  toggleLeftSidebar: () => void,
  toggleRightSidebar: () => void,
  leftOpen: boolean,
  rightOpen: boolean,
  onOpenIde?: () => void
}) => {
  const [projects, setProjects] = useState<ProjectFolder[]>(() => {
    const saved = localStorage.getItem('quantix_projects');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedProject, setSelectedProject] = useState<ProjectFolder | null>(() => {
    const saved = localStorage.getItem('quantix_active_project');
    return saved ? JSON.parse(saved) : null;
  });
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<'create' | 'security'>('create');
  
  // Confirmation state for deleting project
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectFolder | null>(null);
  
  const [wizardFolders, setWizardFolders] = useState<ProjectFolder[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<'default' | 'full' | 'turbo'>('default');

  const [messages, setMessages] = useState<{role: 'user' | 'assistant' | 'system', content: string}[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Save messages whenever they change, if we have an active conversation
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('quantix_active_chat_id', activeConversationId);
      if (messages.length > 0) {
        localStorage.setItem(`quantix_messages_${activeConversationId}`, JSON.stringify(messages));
      }
    } else {
      localStorage.removeItem('quantix_active_chat_id');
    }
  }, [messages, activeConversationId]);

  // Listen for chat switching and deletion
  useEffect(() => {
    const handleLoadChat = (e: any) => {
      const { id, title } = e.detail;
      setActiveConversationId(id);
      setChatTitle(title);
      const savedMessages = localStorage.getItem(`quantix_messages_${id}`);
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        setMessages([]);
      }
    };

    const handleDeleteChat = (e: any) => {
      const { id, projPath } = e.detail;
      if (id === activeConversationId) {
        const savedConvos = JSON.parse(localStorage.getItem('quantix_conversations') || '{}');
        const projConvos = savedConvos[projPath] || [];
        const remaining = projConvos.filter((c: any) => c.id !== id);
        
        if (remaining.length > 0) {
          const nextChat = remaining[0];
          setActiveConversationId(nextChat.id);
          setChatTitle(nextChat.title);
          const savedMsgs = localStorage.getItem(`quantix_messages_${nextChat.id}`);
          setMessages(savedMsgs ? JSON.parse(savedMsgs) : []);
        } else {
          setActiveConversationId(null);
          setChatTitle(null);
          setMessages([]);
        }
      }
      localStorage.removeItem(`quantix_messages_${id}`);
    };

    const handleNewChat = () => {
      setActiveConversationId(null);
      setChatTitle(null);
      setMessages([]);
    };

    window.addEventListener('load-conversation', handleLoadChat);
    window.addEventListener('delete-conversation', handleDeleteChat);
    window.addEventListener('new-conversation', handleNewChat);
    return () => {
      window.removeEventListener('load-conversation', handleLoadChat);
      window.removeEventListener('delete-conversation', handleDeleteChat);
      window.removeEventListener('new-conversation', handleNewChat);
    };
  }, [activeConversationId]);

  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    if (!inputValue.trim() || isStreamingRef.current) return;
    
    let isFirstMessage = false;
    let convId = activeConversationId;
    if (messages.length === 0) {
      convId = Date.now().toString();
      setActiveConversationId(convId);
      setChatTitle("New Conversation");
      isFirstMessage = true;
    }
    
    const userMessage = { role: 'user' as const, content: inputValue };
    const allMessages = [...messages, userMessage];
    setMessages([...allMessages, { role: 'assistant', content: '' }]);
    setInputValue("");
    setIsStreaming(true);
    isStreamingRef.current = true;

    // Background Title Generation
    if (isFirstMessage && convId) {
      callDispatcherAPI({
        model: "Dispatcher v1", // Use fastest model for title
        messages: [{ role: 'user', content: `Summarize this prompt into a very short 3-5 word title, no quotes, no extra text: "${inputValue}"` }],
        checkIsStreaming: () => true,
        onChunk: () => {},
        onError: () => {},
        onSuccess: (fullText) => {
          const cleanTitle = fullText.replace(/['"]/g, '').trim();
          setChatTitle(cleanTitle);
          // Save the new title to local storage so Sidebar picks it up
          const savedConvos = JSON.parse(localStorage.getItem('quantix_conversations') || '{}');
          const projPath = selectedProject ? selectedProject.path : 'default';
          const projConvos = savedConvos[projPath] || [];
          
          const existing = projConvos.find((c: any) => c.id === convId);
          if (existing) {
            existing.title = cleanTitle;
          } else {
            projConvos.unshift({ id: convId, title: cleanTitle });
          }
          savedConvos[projPath] = projConvos;
          localStorage.setItem('quantix_conversations', JSON.stringify(savedConvos));
        }
      });
    } else if (messages.length === 0 && convId) {
       // Just save it immediately if we couldn't do background (fallback)
       const savedConvos = JSON.parse(localStorage.getItem('quantix_conversations') || '{}');
       const projPath = selectedProject ? selectedProject.path : 'default';
       const projConvos = savedConvos[projPath] || [];
       if (!projConvos.some((c: any) => c.id === convId)) {
         projConvos.unshift({ id: convId, title: "New Conversation" });
         savedConvos[projPath] = projConvos;
         localStorage.setItem('quantix_conversations', JSON.stringify(savedConvos));
       }
    }

    // Actual chat response stream
    callDispatcherAPI({
      model: selectedModel,
      messages: allMessages,
      checkIsStreaming: () => isStreamingRef.current,
      onChunk: (chunk) => {
        setMessages(prev => {
          const newMsgs = [...prev];
          const last = newMsgs[newMsgs.length - 1];
          if (last.role === 'assistant') {
            last.content += chunk;
          }
          return newMsgs;
        });
      },
      onError: (err) => {
        setMessages(prev => {
          const newMsgs = [...prev];
          const last = newMsgs[newMsgs.length - 1];
          if (last.role === 'assistant') {
            last.content += `\n\n**Error:** ${err}`;
          }
          return newMsgs;
        });
        isStreamingRef.current = false;
        setIsStreaming(false);
      },
      onSuccess: () => {
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    });
  };

  const [showPlusDropdown, setShowPlusDropdown] = useState<boolean>(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);
  const [showModeDropdown, setShowModeDropdown] = useState<boolean>(false);

  const [selectedModel, setSelectedModel] = useState<string>("Dispatcher v1");
  const [selectedMode, setSelectedMode] = useState<string>("Local");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const plusDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setShowDropdown(false);
      if (plusDropdownRef.current && !plusDropdownRef.current.contains(target)) setShowPlusDropdown(false);
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) setShowModelDropdown(false);
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(target)) setShowModeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    
    const handleOpenWizard = () => {
      setWizardStep('create');
      setWizardFolders([]);
      setShowWizard(true);
    };
    window.addEventListener('open-add-project-wizard', handleOpenWizard);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('open-add-project-wizard', handleOpenWizard);
    };
  }, []);

  const handleAddFolder = async () => {
    try {
      const folderData = await (window as any).electron.selectFolder();
      if (folderData) {
        // Prevent duplicate folders
        if (!wizardFolders.some(f => f.path === folderData.path)) {
          setWizardFolders([...wizardFolders, folderData]);
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const handleRemoveFolder = (pathToRemove: string) => {
    setWizardFolders(wizardFolders.filter(f => f.path !== pathToRemove));
  };

  const handleNextStep = () => {
    if (wizardStep === 'create') {
      setWizardStep('security');
    } else {
      // Completed security step, save project
      if (wizardFolders.length > 0) {
        const newProject = wizardFolders[0];
        setSelectedProject(newProject);
        localStorage.setItem('quantix_active_project', JSON.stringify(newProject));

        // Add to project list if not already there
        const updatedProjects = [...projects];
        if (!updatedProjects.some(p => p.path === newProject.path)) {
          updatedProjects.push(newProject);
          setProjects(updatedProjects);
          localStorage.setItem('quantix_projects', JSON.stringify(updatedProjects));
        }
      }
      setShowWizard(false);
      setWizardFolders([]);
    }
  };

  const handleDeleteProject = (pathToDelete: string) => {
    const updatedProjects = projects.filter(p => p.path !== pathToDelete);
    setProjects(updatedProjects);
    localStorage.setItem('quantix_projects', JSON.stringify(updatedProjects));
    
    if (selectedProject?.path === pathToDelete) {
      const nextActive = updatedProjects.length > 0 ? updatedProjects[0] : null;
      setSelectedProject(nextActive);
      if (nextActive) {
        localStorage.setItem('quantix_active_project', JSON.stringify(nextActive));
      } else {
        localStorage.removeItem('quantix_active_project');
      }
    }
  };

  const handleSkip = () => {
    setShowWizard(false);
    setWizardFolders([]);
  };

  return (
    <div className="flex-1 h-full bg-transparent flex flex-col relative z-0">
      
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between z-10 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto region-no-drag mt-12">
          <button onClick={toggleLeftSidebar} className={cn("p-1.5 rounded-md transition-colors shrink-0", leftOpen ? "text-white bg-white/10" : "text-[#8b8b93] hover:text-white hover:bg-white/5")}>
            {leftOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          
          {chatTitle && messages.length > 0 && (
            <div className="text-[13px] font-medium text-white/90 truncate max-w-[400px]">
              {chatTitle}
            </div>
          )}
        </div>

        <div className="pointer-events-auto region-no-drag mt-12 flex items-center gap-2">
            <button 
              onClick={onOpenIde}
              className="flex items-center gap-2 text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors px-3 py-1.5 rounded-md text-xs font-semibold"
            >
              <img src="/icon.png" alt="QUANTIX Logo" className="w-3.5 h-3.5 object-contain" />
              Open QUANTIX IDE
            </button>
          <button 
            onClick={toggleRightSidebar}
            className={cn("p-1.5 rounded-md transition-colors", rightOpen ? "text-white bg-white/10" : "text-[#8b8b93] hover:text-white hover:bg-white/5")}
          >
            {rightOpen ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <motion.div layout className={cn("flex-1 flex flex-col px-6", messages.length === 0 ? "justify-center items-center" : "overflow-hidden")}>
        
        {messages.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 w-full max-w-[700px] mx-auto overflow-y-auto custom-scrollbar pt-32 pb-4 flex flex-col gap-6"
          >
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                <div className={cn(
                  "max-w-[85%] text-[14px] leading-relaxed whitespace-pre-wrap font-sans",
                  msg.role === 'user' ? "bg-white/10 text-white px-4 py-2.5 rounded-2xl" : "bg-transparent text-[#e2e2e3]"
                )}>
                  {msg.content}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        <motion.div layout className={cn(
          "w-full max-w-[700px] flex flex-col items-center",
          messages.length > 0 ? "mx-auto pb-6" : ""
        )}>
          
          <div className="w-full flex justify-start mb-2 pointer-events-auto relative" ref={dropdownRef}>
            <div 
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 text-[#8b8b93] text-[13px] font-medium px-2 py-1 hover:bg-white/5 rounded-md cursor-pointer transition-colors"
            >
              <Folder size={14} />
              <span>{selectedProject ? `${selectedProject.name}/` : "Choose Project"}</span>
              {selectedProject?.branch && (
                <span className="flex items-center gap-1 text-[11px] text-[#6b6b73] ml-1">
                  <GitBranch size={11} />
                  {selectedProject.branch}
                </span>
              )}
              <ChevronDown size={14} />
            </div>

            {/* Project Selection Dropdown */}
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-4 top-8 w-56 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 max-h-60 overflow-y-auto custom-scrollbar"
                >
                  {projects.length > 0 && (
                    <>
                      <div className="px-3 py-1 text-[10px] text-[#6b6b73] uppercase font-bold tracking-wider">
                        Projects
                      </div>
                      {projects.map((proj) => (
                        <div 
                          key={proj.path}
                          className="w-full flex items-center justify-between hover:bg-white/5 group relative"
                        >
                          <button
                            key={proj.path}
                            onClick={() => {
                              setSelectedProject(proj);
                              localStorage.setItem('quantix_active_project', JSON.stringify(proj));
                              setShowDropdown(false);
                            }}
                            className={cn(
                              "flex-1 px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors truncate",
                              selectedProject?.path === proj.path 
                                ? "text-white font-medium" 
                                : "text-[#a8a8b1]"
                            )}
                          >
                            <Folder size={14} className="text-[#8b8b93] shrink-0" />
                            <span className="truncate">{proj.name}/</span>
                            {proj.branch && (
                              <span className="flex items-center gap-0.5 text-[9px] text-[#6b6b73] bg-white/5 px-1 py-0.5 rounded shrink-0">
                                <GitBranch size={9} />
                                {proj.branch}
                              </span>
                            )}
                          </button>
                          <div className="relative flex items-center shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setProjectToDelete(proj);
                                setShowConfirmDelete(true);
                              }}
                              className="p-1.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors mr-1 shrink-0 peer"
                            >
                              <Trash2 size={13} />
                            </button>
                            <div className="absolute right-full mr-2 px-2 py-1 rounded bg-red-600 text-white text-[10px] font-medium whitespace-nowrap pointer-events-none opacity-0 transition-opacity peer-hover:opacity-100 shadow-md z-[100]">
                              delete this project
                              <div className="absolute top-1/2 -translate-y-1/2 left-full border-4 border-transparent border-l-red-600" />
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-white/5 my-1" />
                    </>
                  )}
                  
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setWizardStep('create');
                      setWizardFolders([]);
                      setShowWizard(true);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                  >
                    <Plus size={14} />
                    Add new project
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-full bg-[#1c1c21] border border-white/5 rounded-2xl p-3 flex flex-col shadow-2xl focus-within:border-white/20 transition-colors pointer-events-auto">
            <textarea 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything, @ to mention, / for actions" 
              className="w-full bg-transparent resize-none outline-none text-[#e2e2e3] text-[14px] placeholder-[#6b6b73] h-10 custom-scrollbar"
            />
            
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                <div className="relative" ref={plusDropdownRef}>
                  <button 
                    onClick={() => setShowPlusDropdown(!showPlusDropdown)}
                    className="text-[#8b8b93] hover:text-white transition-colors p-1"
                  >
                    <Plus size={16} />
                  </button>
                  <AnimatePresence>
                    {showPlusDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 w-40 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                      >
                        <button className="w-full px-3 py-2 text-left text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors">
                          <Paperclip size={14} /> Attachments
                        </button>
                        <button className="w-full px-3 py-2 text-left text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors">
                          <Zap size={14} /> Actions
                        </button>
                        <button className="w-full px-3 py-2 text-left text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 flex items-center gap-2 transition-colors">
                          <Plug2 size={14} /> Connections
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative" ref={modelDropdownRef}>
                  <button 
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="flex items-center gap-1 text-[12px] text-[#a8a8b1] hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-md"
                  >
                    {selectedModel}
                    <ChevronDown size={12} />
                  </button>
                  <AnimatePresence>
                    {showModelDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-40 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                      >
                        {['Dispatcher v1', 'Dispatcher v1.2', 'Dispatcher v2'].map(model => (
                          <button 
                            key={model}
                            onClick={() => { setSelectedModel(model); setShowModelDropdown(false); }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                              selectedModel === model ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                            )}
                          >
                            {model}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="relative" ref={modeDropdownRef}>
                  <button 
                    onClick={() => setShowModeDropdown(!showModeDropdown)}
                    className="flex items-center gap-1 text-[12px] text-[#a8a8b1] hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-md"
                  >
                    {selectedMode === 'Local' ? <HardDrive size={12} /> : <Cloud size={12} />}
                    {selectedMode}
                    <ChevronDown size={12} />
                  </button>
                  <AnimatePresence>
                    {showModeDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-2 w-32 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                      >
                        {['Local', 'Cloud'].map(mode => (
                          <button 
                            key={mode}
                            onClick={() => { setSelectedMode(mode); setShowModeDropdown(false); }}
                            className={cn(
                              "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                              selectedMode === mode ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                            )}
                          >
                            {mode === 'Local' ? <HardDrive size={14} /> : <Cloud size={14} />}
                            {mode}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <button 
                onClick={handleSend}
                disabled={isStreaming}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  inputValue.trim().length > 0
                    ? "bg-[#007acc] hover:bg-[#0088dd] text-white"
                    : "bg-white/5 hover:bg-white/10 text-[#8b8b93] hover:text-white"
                )}
              >
                {inputValue.trim().length > 0 ? <Send size={14} /> : <Mic size={14} />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Multi-Step Creation Wizard Modal */}
      <AnimatePresence>
        {showWizard && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Step 1: Create Project / Select Folders */}
              {wizardStep === 'create' && (
                <>
                  <div className="flex items-start justify-between p-6 pb-2">
                    <div>
                      <h2 className="text-lg font-bold text-white leading-none">Add Project</h2>
                      <p className="text-xs text-[#8b8b93] mt-1.5 font-medium">Select Folder(s)</p>
                    </div>
                    <button 
                      onClick={() => setShowWizard(false)}
                      className="p-1 text-[#8b8b93] hover:text-white rounded-md transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-6 flex flex-col gap-4 flex-1">
                    {/* Chosen folders list */}
                    {wizardFolders.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] text-[#6b6b73] uppercase font-bold tracking-wider">
                          Selected Folders
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {wizardFolders.map((folder) => (
                            <div 
                              key={folder.path}
                              className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5"
                            >
                              <div className="flex items-center gap-2 text-xs font-medium text-white truncate max-w-[85%]">
                                <Folder size={14} className="text-[#8b8b93] shrink-0" />
                                <span className="truncate">{folder.name}/</span>
                                {folder.branch && (
                                  <span className="flex items-center gap-0.5 text-[9px] text-[#6b6b73] bg-white/5 px-1.5 py-0.5 rounded ml-1 shrink-0">
                                    <GitBranch size={9} />
                                    {folder.branch}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => handleRemoveFolder(folder.path)}
                                className="text-red-500 hover:text-red-400 p-1 hover:bg-red-500/10 rounded transition-colors"
                              >
                                <X size={14} className="text-red-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add Folder Trigger */}
                    <button
                      onClick={handleAddFolder}
                      className="w-full py-3.5 border border-dashed border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-[#8b8b93] hover:text-white transition-all"
                    >
                      <Plus size={14} />
                      <span>Add Folder</span>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="px-6 pb-6 pt-2 flex justify-end gap-3">
                    <button
                      onClick={handleSkip}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                    >
                      Skip
                    </button>
                    {wizardFolders.length > 0 && (
                      <button
                        onClick={handleNextStep}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-colors"
                      >
                        Next
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Step 2: Agent Security Settings */}
              {wizardStep === 'security' && (
                <>
                  <div className="flex items-start justify-between p-6 pb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Agent Security Settings</h2>
                    </div>
                    <button 
                      onClick={() => setShowWizard(false)}
                      className="p-1 text-[#8b8b93] hover:text-white rounded-md transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Options */}
                  <div className="px-6 py-1 flex flex-col gap-2.5">
                    {/* Full Permission */}
                    <button
                      onClick={() => setSelectedSecurity('default')}
                      className={cn(
                        "w-full flex items-center gap-3.5 p-3 rounded-lg text-left transition-all border",
                        selectedSecurity === 'default'
                          ? "bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                          : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                      )}
                    >
                      <div className="p-2 rounded-lg bg-white/5 text-[#a8a8b1] shrink-0">
                        <ShieldCheck size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-white">Full Permission</h4>
                        <p className="text-[11px] text-[#8b8b93] mt-0.5 leading-normal">
                          full permission to read and write this folder.
                        </p>
                      </div>
                    </button>

                    {/* User Guided */}
                    <button
                      onClick={() => setSelectedSecurity('full')}
                      className={cn(
                        "w-full flex items-center gap-3.5 p-3 rounded-lg text-left transition-all border",
                        selectedSecurity === 'full'
                          ? "bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                          : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                      )}
                    >
                      <div className="p-2 rounded-lg bg-white/5 text-[#a8a8b1] shrink-0">
                        <Lock size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-white">User Guided</h4>
                        <p className="text-[11px] text-[#8b8b93] mt-0.5 leading-normal">
                          need user permission to read and write in this folder.
                        </p>
                      </div>
                    </button>

                    {/* Semi Permission */}
                    <button
                      onClick={() => setSelectedSecurity('turbo')}
                      className={cn(
                        "w-full flex items-center gap-3.5 p-3 rounded-lg text-left transition-all border",
                        selectedSecurity === 'turbo'
                          ? "bg-white/10 border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                          : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                      )}
                    >
                      <div className="p-2 rounded-lg bg-white/5 text-[#a8a8b1] shrink-0">
                        <ShieldAlert size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-white">Semi Permission</h4>
                        <p className="text-[11px] text-[#8b8b93] mt-0.5 leading-normal">
                          Some actions are permitted some need user permission.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="p-6 flex justify-end gap-3 mt-2">
                    <button
                      onClick={() => setWizardStep('create')}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmDelete && projectToDelete && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-start justify-between p-6 pb-4">
                <h2 className="text-lg font-semibold text-white">Delete Project</h2>
                <button 
                  onClick={() => {
                    setShowConfirmDelete(false);
                    setProjectToDelete(null);
                  }}
                  className="p-1 text-[#8b8b93] hover:text-white rounded-md transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-6 py-2">
                <p className="text-sm text-[#8b8b93] leading-relaxed">
                  Are you sure to delete the project <span className="text-white font-semibold">{projectToDelete.name}</span>?
                </p>
              </div>

              <div className="p-6 flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowConfirmDelete(false);
                    setProjectToDelete(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteProject(projectToDelete.path);
                    setShowConfirmDelete(false);
                    setProjectToDelete(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
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

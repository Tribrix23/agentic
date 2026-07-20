import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Folder, FolderOpen, File, Code, Terminal, Settings, PanelLeft, PanelLeftClose, FolderPlus, Trash2, Plus, X, Shield, HardDrive, Monitor, Lock, GitBranch, FileJson, FileType2, FileImage, FileText, FileCode2, Database, Save, Menu, Play, StopCircle, Radio, Files } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { TitleBar } from './TitleBar';
import { cn } from '../App';
import { motion, AnimatePresence, Variants } from 'framer-motion';

const orb1Variants: Variants = {
  animate: {
    x: ['-20%', '20%', '-10%', '-20%'],
    y: ['-20%', '10%', '20%', '-20%'],
    transition: { duration: 12, repeat: Infinity, ease: "easeInOut" }
  }
};

const orb2Variants: Variants = {
  animate: {
    x: ['20%', '-20%', '10%', '20%'],
    y: ['20%', '-10%', '-20%', '20%'],
    transition: { duration: 15, repeat: Infinity, ease: "easeInOut" }
  }
};

const buttonVariants = {
  rest: {
    scale: 1,
    boxShadow: "0px 8px 30px rgba(99, 102, 241, 0.2)",
    background: "linear-gradient(90deg, #4F46E5 0%, #7C3AED 100%)",
  },
  hover: {
    scale: 1.04,
    boxShadow: "0px 15px 40px rgba(99, 102, 241, 0.5)",
    background: "linear-gradient(90deg, #6366F1 0%, #8B5CF6 100%)",
  },
  tap: { scale: 0.96 }
};

const shimmerVariants: Variants = {
  rest: { x: "-100%" },
  hover: {
    x: "100%",
    transition: {
      duration: 0.4,
      ease: "linear"
    }
  }
};

interface IdeContainerProps {
  onBack: () => void;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface ProjectFolder {
  path: string;
  name: string;
  branch: string | null;
}

const getFileIcon = (filename: string, className?: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return <FileJson size={14} className={className || "text-[#fbc02d] shrink-0"} />;
    case 'ts':
    case 'tsx':
      return <FileType2 size={14} className={className || "text-[#3178c6] shrink-0"} />;
    case 'js':
    case 'jsx':
      return <FileCode2 size={14} className={className || "text-[#f7df1e] shrink-0"} />;
    case 'html':
      return <Code size={14} className={className || "text-[#e34c26] shrink-0"} />;
    case 'css':
      return <FileCode2 size={14} className={className || "text-[#264de4] shrink-0"} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'ico':
      return <FileImage size={14} className={className || "text-[#4caf50] shrink-0"} />;
    case 'md':
    case 'txt':
      return <FileText size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
    default:
      return <File size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
  }
};

const getFileLanguage = (filename: string | null) => {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'md':
      return 'markdown';
    default:
      return 'javascript';
  }
};

export const IdeContainer: React.FC<IdeContainerProps> = ({ onBack }) => {
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [activeProject, setActiveProject] = useState<ProjectFolder | null>(() => {
    const saved = localStorage.getItem('quantix_active_project');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [projects, setProjects] = useState<ProjectFolder[]>(() => {
    const saved = localStorage.getItem('quantix_projects');
    return saved ? JSON.parse(saved) : [];
  });

  const [projectFiles, setProjectFiles] = useState<FileNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalFileContent, setOriginalFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Dropdown & Wizard States
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<'create' | 'security'>('create');
  const [wizardFolders, setWizardFolders] = useState<ProjectFolder[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<'full' | 'user' | 'semi'>('user');
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectFolder | null>(null);

  // Editor Menu & Live Server States
  const [showEditorMenu, setShowEditorMenu] = useState<boolean>(false);
  const [liveServerInfo, setLiveServerInfo] = useState<{ port: number; active: boolean; progress: number } | null>(null);
  const [isLiveServerRunning, setIsLiveServerRunning] = useState<boolean>(false);
  const editorMenuRef = useRef<HTMLDivElement>(null);

  const handleRunLive = async () => {
    if (!activeProject?.path) return;
    setShowEditorMenu(false);
    
    // Call our new backend python server launcher
    const res = await (window as any).electron.startLiveServer(activeProject.path);
    if (res.success) {
      setIsLiveServerRunning(true);
      setLiveServerInfo({ port: res.port, active: true, progress: 100 });
      // The progress animation is handled purely by Framer Motion.
      // We just need to hide it after 5 seconds.
      setTimeout(() => {
        setLiveServerInfo(null);
      }, 5000);
    } else {
      console.error("Failed to start live server:", res.error);
    }
  };

  const handleStopLive = async () => {
    setShowEditorMenu(false);
    const res = await (window as any).electron.stopLiveServer();
    if (res.success) {
      setIsLiveServerRunning(false);
      // Optional: Show a quick toast or reset liveServerInfo if still visible
    } else {
      console.error("Failed to stop live server:", res.error);
    }
  };

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (editorMenuRef.current && !editorMenuRef.current.contains(event.target as Node)) {
        setShowEditorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeProject && activeProject.path) {
      (window as any).electron.readProjectFiles(activeProject.path).then((data: FileNode[]) => {
        setProjectFiles(data || []);
      });
    } else {
      setProjectFiles([]);
    }
  }, [activeProject]);

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'file') {
      setSelectedFilePath(node.path);
      setSelectedFileName(node.name);
      setIsDirty(false);
      setFileContent('Loading...');
      setOriginalFileContent('Loading...');
      const content = await (window as any).electron.readFileContent(node.path);
      setFileContent(content);
      setOriginalFileContent(content);
    }
  };

  const handleSaveFile = async () => {
    if (selectedFilePath && isDirty) {
      const res = await (window as any).electron.saveFileContent(selectedFilePath, fileContent);
      if (res.success) {
        setIsDirty(false);
        setOriginalFileContent(fileContent);
      } else {
        console.error('Failed to save file:', res.error);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilePath, isDirty, fileContent]);

  const handleAddFolder = async () => {
    try {
      const folderData = await (window as any).electron.selectFolder();
      if (folderData) {
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
      if (wizardFolders.length > 0) {
        const newProject = wizardFolders[0];
        setActiveProject(newProject);
        localStorage.setItem('quantix_active_project', JSON.stringify(newProject));

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
    
    if (activeProject?.path === pathToDelete) {
      const nextActive = updatedProjects.length > 0 ? updatedProjects[0] : null;
      setActiveProject(nextActive);
      setSelectedFilePath(null);
      setSelectedFileName(null);
      setFileContent('');
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
    <div className="w-full h-screen flex flex-col bg-[#08080c] text-[#e2e2e3] select-none relative z-50 overflow-hidden">
      {/* Live Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div 
          variants={orb1Variants}
          animate="animate"
          className="absolute top-[0%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-purple-600/10 blur-[120px]"
        />
        <motion.div 
          variants={orb2Variants}
          animate="animate"
          className="absolute bottom-[0%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px]"
        />
      </div>

      {/* TitleBar wrapper */}
      <TitleBar />

      {/* Top Header of the IDE */}
      <div className="absolute top-0 left-0 right-0 h-[88px] flex items-center justify-between border-b border-white/5 px-4 bg-[#0f0f13] z-10 pointer-events-none">
        <div className="flex items-center gap-3 select-none pointer-events-auto region-no-drag mt-12">
          <button 
            onClick={() => setExplorerOpen(!explorerOpen)} 
            className={cn("p-1.5 rounded-md transition-colors mr-1", explorerOpen ? "text-white bg-white/10" : "text-[#8b8b93] hover:text-white hover:bg-white/5")}
          >
            {explorerOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          <span className="text-xs font-bold bg-gradient-to-r from-[#c084fc] to-[#60a5fa] bg-clip-text text-transparent">
            {activeProject ? activeProject.name.toUpperCase() : 'WORKSPACE IDE'}
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto region-no-drag mt-12">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors px-3 py-1.5 rounded-md text-xs font-semibold"
          >
            <img src="/icon.png" alt="QUANTIX Logo" className="w-3.5 h-3.5 object-contain" />
            Close QUANTIX IDE
          </button>
          <div className="w-[30px] h-[30px]" />
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 flex overflow-hidden pt-[88px]">
        {/* Activity Bar */}
        <div className="w-[52px] bg-[#08080c] flex flex-col items-center py-4 gap-6 border-r border-white/5 z-20 flex-shrink-0">
          <button className="text-white hover:text-white transition-colors relative group w-full flex justify-center cursor-pointer">
            <Files size={22} strokeWidth={1.5} />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[22px] bg-blue-500 rounded-r-full" />
          </button>
          <button className="text-[#5b5b63] hover:text-white transition-colors relative group w-full flex justify-center cursor-pointer">
            <GitBranch size={22} strokeWidth={1.5} />
          </button>
        </div>

        {/* Left File Explorer Panel */}
        <div className={cn(
          "border-r border-white/5 bg-[#0f0f13] flex flex-col py-3 select-none transition-all duration-300 ease-in-out overflow-hidden relative",
          explorerOpen ? "w-60" : "w-0 border-r-0"
        )}>
          <div className="px-4 mb-2 flex items-center justify-between relative" ref={dropdownRef}>
            <span className="text-[11px] font-bold tracking-wider text-[#8b8b93] uppercase">
              Project Files
            </span>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors"
            >
              <FolderPlus size={14} />
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-4 top-full mt-1 w-52 bg-[#0f0f13] border border-white/10 rounded-lg shadow-2xl py-1.5 z-40 flex flex-col pointer-events-auto"
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
                            onClick={() => {
                              setActiveProject(proj);
                              localStorage.setItem('quantix_active_project', JSON.stringify(proj));
                              setSelectedFilePath(null);
                              setSelectedFileName(null);
                              setFileContent('');
                              setShowDropdown(false);
                            }}
                            className={cn(
                              "flex-1 px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors truncate",
                              activeProject?.path === proj.path 
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

          <div className="flex-1 overflow-y-auto px-2 space-y-1 text-xs">
            {activeProject ? (
              <FileTreeItem 
                node={{
                  name: activeProject.name,
                  path: activeProject.path,
                  type: 'folder',
                  children: projectFiles
                }}
                onFileClick={handleFileClick} 
                selectedPath={selectedFilePath} 
                depth={0}
                defaultOpen={true}
              />
            ) : (
              <div className="px-4 py-2 text-[#8b8b93] italic">No project loaded</div>
            )}
          </div>
        </div>

        <div className={cn("flex-1 flex flex-col overflow-hidden transition-colors", selectedFileName ? "bg-[#08080c]" : "bg-transparent")}>
          {selectedFileName ? (
            <>
              {/* Editor Tabs */}
              <div className="h-9 border-b border-white/5 bg-[#0f0f13] flex items-center justify-between px-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#08080c] border-b-2 border-blue-500 rounded-t-md text-xs font-medium text-white group relative">
                  {getFileIcon(selectedFileName, "w-3 h-3 shrink-0")}
                  <span>{selectedFileName}</span>
                  {isDirty && <div className="w-2 h-2 rounded-full bg-blue-500 ml-1" title="Unsaved changes" />}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFilePath(null);
                      setSelectedFileName(null);
                    }}
                    className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 pr-2">
                  <button
                    onClick={handleSaveFile}
                    disabled={!isDirty}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm border",
                      isDirty 
                        ? "bg-[#25252d] hover:bg-[#2f2f38] border-white/5 text-white shadow-md" 
                        : "bg-transparent border-transparent text-[#5b5b63] cursor-not-allowed shadow-none"
                    )}
                  >
                    <Save size={13} className={cn(isDirty ? "text-white" : "text-[#5b5b63]")} />
                    Save
                    <div className={cn(
                      "flex items-center ml-1.5 px-2 py-0.5 rounded backdrop-blur-md shadow-inner text-[10px] tracking-wider font-bold transition-all",
                      isDirty ? "bg-white/10 text-white border border-white/5" : "bg-black/20 text-[#5b5b63]"
                    )}>
                      CTRL + S
                    </div>
                  </button>
                  
                  {/* Editor Menu */}
                  <div className="relative" ref={editorMenuRef}>
                    <button
                      onClick={() => setShowEditorMenu(!showEditorMenu)}
                      className="p-1.5 rounded-md hover:bg-white/5 text-[#8b8b93] hover:text-white transition-colors ml-1"
                    >
                      <Menu size={16} />
                    </button>
                    <AnimatePresence>
                      {showEditorMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 5, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 w-40 bg-[#18181f] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 py-1"
                        >
                          {isLiveServerRunning ? (
                            <button
                              onClick={handleStopLive}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                            >
                              <StopCircle size={14} className="text-red-500" />
                              Stop Live
                            </button>
                          ) : (
                            <button
                              onClick={handleRunLive}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                            >
                              <Play size={14} className="text-green-500" />
                              Run Live
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Code Editor */}
              <div className="flex-1 overflow-auto bg-[#08080c] select-text relative flex" style={{ fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace' }}>
                <div className="flex flex-col text-[#5b5b63] text-right bg-[#08080c] select-none border-r border-white/5 py-4 w-[3.5rem] px-3 z-20 sticky left-0 text-[13px] leading-[1.5]">
                  {fileContent.split('\n').map((_, i) => (
                    <span key={i} className="block">{i + 1}</span>
                  ))}
                </div>
                <div className="flex-1 min-w-[800px] grid">
                  <textarea
                    value={fileContent}
                    onChange={(e) => {
                      setFileContent(e.target.value);
                      setIsDirty(e.target.value !== originalFileContent);
                    }}
                    spellCheck={false}
                    className="col-start-1 row-start-1 w-full h-full p-4 bg-transparent text-transparent caret-white resize-none outline-none z-10 text-[13px] leading-[1.5] whitespace-pre"
                    style={{ WebkitTextFillColor: 'transparent', border: 'none', margin: 0, overflow: 'hidden', fontFamily: 'inherit', tabSize: 4 }}
                  />
                  <div className="col-start-1 row-start-1 w-full h-full pointer-events-none">
                    <SyntaxHighlighter
                      language={getFileLanguage(selectedFileName)}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '1rem',
                        background: 'transparent',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        overflow: 'hidden',
                        fontFamily: 'inherit',
                        tabSize: 4
                      }}
                      codeTagProps={{ style: { fontFamily: 'inherit', lineHeight: '1.5' } }}
                    >
                      {fileContent || ' '}
                    </SyntaxHighlighter>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-[#8b8b93] select-none">
              <img 
                src="/icon.png" 
                alt="QUANTIX Logo" 
                className="w-20 h-20 object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)] mb-4"
              />
              <h2 className="text-xl font-bold text-white tracking-wider">QUANTIX IDE</h2>
              <p className="text-xs text-[#6b6b73] mt-1 mb-4">Your intelligent code environment</p>
              
              <motion.button
                variants={buttonVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
                onClick={() => {
                  setWizardStep('create');
                  setWizardFolders([]);
                  setShowWizard(true);
                }}
                className={cn(
                  "relative overflow-hidden group",
                  "flex items-center justify-center",
                  "w-[280px] h-[40px] rounded-md",
                  "transition-all duration-300 ease-out cursor-pointer mt-4"
                )}
              >
                {/* The Shimmer Layer */}
                <motion.div
                  variants={shimmerVariants}
                  className="absolute inset-0 w-full z-0 skew-x-[-20deg]"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)"
                  }}
                />

                <div className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none gap-3">
                  <span className="text-[14px] font-semibold text-white tracking-wide">
                    Add Project
                  </span>
                </div>
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Live Server Indicator */}
      <AnimatePresence>
        {isLiveServerRunning && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed bottom-6 right-6 z-[90] group"
          >
            <div className="flex items-center justify-center p-2 rounded-full bg-purple-500/20 text-purple-400 relative cursor-pointer shadow-lg backdrop-blur-sm border border-purple-500/20">
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              >
                <Radio size={18} />
              </motion.div>
              <motion.div
                animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border border-purple-500/60"
              />
            </div>
            
            {/* Tooltip */}
            <div className="absolute bottom-full mb-3 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-black/90 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md whitespace-nowrap z-50 border border-white/10 shadow-xl">
              Live server is on
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Server Notification */}
      <AnimatePresence>
        {liveServerInfo && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-6 right-6 z-[100] w-80 bg-black/40 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Shimmer Effect */}
            <motion.div
              initial={{ x: "-150%" }}
              animate={{ x: "200%" }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
              className="absolute inset-0 z-0 w-1/2 pointer-events-none skew-x-[-20deg]"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)"
              }}
            />
            
            <div className="p-4 flex items-start gap-3 relative z-10">
              <div className="p-2 rounded-full bg-green-500/20 text-green-400 mt-0.5">
                <Play size={16} fill="currentColor" />
              </div>
              <div className="flex-1">
                <h3 className="text-white text-sm font-semibold">Live Server Running</h3>
                <p className="text-[#8b8b93] text-xs mt-1 leading-relaxed">
                  Your live server is up and running on <span className="text-blue-400 font-mono">localhost:{liveServerInfo.port}</span>
                </p>
              </div>
              <button 
                onClick={() => setLiveServerInfo(null)}
                className="text-[#5b5b63] hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-1 bg-black/40">
              <motion.div 
                className="h-full bg-blue-500 origin-left"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: 5, ease: 'linear' }}
              />
            </div>
          </motion.div>
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
              <div className="px-6 pt-6 pb-4">
                <h3 className="text-sm font-bold text-white mb-2">Delete Project</h3>
                <p className="text-xs text-[#a8a8b1]">
                  Are you sure to delete the project <span className="text-white font-semibold">{projectToDelete.name}</span>?
                </p>
              </div>
              <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowConfirmDelete(false);
                    setProjectToDelete(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteProject(projectToDelete.path);
                    setShowConfirmDelete(false);
                    setProjectToDelete(null);
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Creation Wizard */}
      <AnimatePresence>
        {showWizard && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-[#0f0f13] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Wizard Step 1: Create */}
              {wizardStep === 'create' && (
                <>
                  <div className="px-6 pt-6 pb-2 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white leading-none">Add Project</h3>
                      <p className="text-xs text-[#8b8b93] mt-1.5 font-medium">Select Folder(s)</p>
                    </div>
                    <button 
                      onClick={handleSkip}
                      className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="p-6 flex flex-col gap-4 flex-1">
                    {wizardFolders.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] text-[#6b6b73] uppercase font-bold tracking-wider">
                          Selected Folders
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {wizardFolders.map((folder) => (
                            <div key={folder.path} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                              <div className="flex items-center gap-2 truncate">
                                <Folder size={14} className="text-[#8b8b93] shrink-0" />
                                <span className="text-xs text-white truncate">{folder.name}/</span>
                                {folder.branch && (
                                  <span className="flex items-center gap-0.5 text-[9px] text-[#6b6b73] bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                                    <GitBranch size={9} />
                                    {folder.branch}
                                  </span>
                                )}
                              </div>
                              <button 
                                onClick={() => handleRemoveFolder(folder.path)}
                                className="p-1 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              >
                                <X size={14} className="text-red-500" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={handleAddFolder}
                      className="w-full py-3.5 border border-dashed border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold text-[#8b8b93] hover:text-white transition-all"
                    >
                      <Plus size={14} />
                      <span>Add Folder</span>
                    </button>
                  </div>
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

              {/* Wizard Step 2: Security */}
              {wizardStep === 'security' && (
                <>
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white">Agent Security Settings</h3>
                    <button 
                      onClick={handleSkip}
                      className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-6 flex flex-col gap-3">
                    {/* Full Permission */}
                    <div 
                      onClick={() => setSelectedSecurity('full')}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedSecurity === 'full' 
                          ? "border-[#007acc] bg-[#007acc]/10" 
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className="mt-0.5 text-[#a8a8b1] bg-white/5 p-1 rounded">
                        <Monitor size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white">Full Permission</div>
                        <div className="text-[11px] text-[#a8a8b1] mt-0.5 leading-relaxed">
                          Full permission to read and write this folder.
                        </div>
                      </div>
                    </div>

                    {/* User Guided */}
                    <div 
                      onClick={() => setSelectedSecurity('user')}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedSecurity === 'user' 
                          ? "border-[#007acc] bg-[#007acc]/10" 
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className="mt-0.5 text-[#a8a8b1] bg-white/5 p-1 rounded">
                        <Shield size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white">User Guided</div>
                        <div className="text-[11px] text-[#a8a8b1] mt-0.5 leading-relaxed">
                          Need user permission to read and write in this folder.
                        </div>
                      </div>
                    </div>

                    {/* Semi Permission */}
                    <div 
                      onClick={() => setSelectedSecurity('semi')}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                        selectedSecurity === 'semi' 
                          ? "border-[#007acc] bg-[#007acc]/10" 
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      )}
                    >
                      <div className="mt-0.5 text-[#a8a8b1] bg-white/5 p-1 rounded">
                        <Lock size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white">Semi Permission</div>
                        <div className="text-[11px] text-[#a8a8b1] mt-0.5 leading-relaxed">
                          Some actions are permitted some need user permission.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-between gap-3">
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
    </div>
  );
};

const FileTreeItem = ({ 
  node, 
  onFileClick, 
  selectedPath, 
  depth = 0,
  defaultOpen = false
}: { 
  node: FileNode; 
  onFileClick: (n: FileNode) => void; 
  selectedPath: string | null; 
  depth?: number;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const paddingLeft = depth * 14 + 8;
  const iconCenter = paddingLeft + 7;

  if (node.type === 'folder') {
    return (
      <div>
        <div 
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${paddingLeft}px` }}
          className="flex items-center gap-1.5 py-1.5 hover:bg-white/5 rounded-md cursor-pointer text-[#a8a8b1] relative z-10"
        >
          {isOpen ? (
            <FolderOpen size={14} className="text-[#8b8b93] shrink-0" />
          ) : (
            <Folder size={14} className="text-[#8b8b93] shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {isOpen && (
          <div className="flex flex-col">
            {node.children && node.children.length > 0 && (
              node.children.map((child, index) => (
                <motion.div 
                  key={child.path} 
                  className="relative"
                  custom={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                >
                  <div 
                    className="absolute bg-[#60a5fa]"
                    style={{ 
                      left: `${iconCenter}px`, 
                      top: 0,
                      bottom: index === node.children.length - 1 ? 'calc(100% - 13px)' : 0,
                      width: '1px'
                    }}
                  />
                  <div 
                    className="absolute bg-[#60a5fa]"
                    style={{ 
                      left: `${iconCenter}px`, 
                      top: '13px',
                      width: '7px',
                      height: '1px'
                    }}
                  />
                  <FileTreeItem 
                    node={child} 
                    onFileClick={onFileClick} 
                    selectedPath={selectedPath} 
                    depth={depth + 1} 
                  />
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  
  return (
    <div 
      onClick={() => onFileClick(node)}
      style={{ paddingLeft: `${paddingLeft}px` }}
      className={cn(
        "flex items-center gap-2 py-1.5 rounded-md cursor-pointer transition-colors relative z-10",
        isSelected ? "bg-white/10 text-white font-medium" : "text-[#a8a8b1] hover:bg-white/5 hover:text-white"
      )}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </div>
  );
};

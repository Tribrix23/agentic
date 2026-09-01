import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Folder, FolderOpen, File, Code, Terminal, Settings, PanelLeft, PanelLeftClose, FolderPlus, Trash2, Plus, X, Shield, HardDrive, Monitor, Lock, GitBranch, FileJson, FileType2, FileImage, FileText, FileCode2, Database, Save, Menu, Play, StopCircle, Radio, Files, Undo2, Redo2, TerminalSquare, AlertCircle, Activity, Maximize2, Minimize2, SplitSquareHorizontal } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { TitleBar } from './TitleBar';
import { EditorArea } from './ide/EditorArea';
import { ActivityBar } from './ide/ActivityBar';
import { EnvironmentManagerView } from './ide/EnvironmentManagerView';
import { EnvironmentTaskStatusBar } from './ide/EnvironmentTaskStatusBar';
import { ContextMenu, ContextMenuItem } from './ide/ContextMenu';
import { TerminalWidget } from './ide/TerminalWidget';
import { SourceControl } from './ide/SourceControl';
import { PortsTab } from './ide/PortsTab';
import { FileIcon } from './chat/FileIcon';
import { cn } from '../App';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import type * as Monaco from 'monaco-editor';
import { isHtmlFile } from '../lib/fileLanguage';

import { Tooltip } from "./ui/Tooltip";

const BlurText = ({ text, className, delay = 0 }: { text: string, className?: string, delay?: number }) => {
  const letters = text.split("");
  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04, delayChildren: delay },
    },
  };
  const child = {
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { type: "spring", damping: 12, stiffness: 100 },
    },
    hidden: {
      opacity: 0,
      filter: "blur(10px)",
      y: 10,
      transition: { type: "spring", damping: 12, stiffness: 100 },
    },
  };
  return (
    <motion.div className={cn("flex flex-wrap justify-center", className)} variants={container} initial="hidden" animate="visible">
      {letters.map((letter, index) => (
        <motion.span variants={child as any} key={index}>
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
      ))}
    </motion.div>
  );
};

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
  user?: { name: string; avatar: string };
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

export interface OpenFile {
  path: string;
  name: string;
  originalContent: string;
  isDiff?: boolean;
  diffOriginalContent?: string;
}

type OutputLine = { text: string; stream: 'info' | 'stdout' | 'stderr' };
type DiagnosticsByPath = Record<string, Monaco.editor.IMarker[]>;

const BottomPanel: React.FC<{
  projectPath?: string;
  diagnostics: DiagnosticsByPath;
  outputLines: OutputLine[];
  requestedTab: 'problems' | 'output' | 'terminal' | null;
  requestId: number;
}> = ({ projectPath, diagnostics, outputLines, requestedTab, requestId }) => {
  const [activeTab, setActiveTab] = useState<'problems' | 'output' | 'terminal' | 'ports'>('terminal');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [panelHeight, setPanelHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);

  // Terminal state
  const [terms, setTerms] = useState<{ id: string, name: string, groupId: string }[]>([{ id: 'term-1', name: 'powershell', groupId: 'group-1' }]);
  const [activeGroupId, setActiveGroupId] = useState('group-1');
  const nextTermIdRef = useRef(2);
  const nextGroupIdRef = useRef(2);

  const addTerminal = () => {
    const id = `term-${nextTermIdRef.current++}`;
    const groupId = `group-${nextGroupIdRef.current++}`;
    setTerms(prev => [...prev, { id, name: 'powershell', groupId }]);
    setActiveGroupId(groupId);
    setActiveTab('terminal');
    setIsExpanded(true);
  };

  const splitTerminal = (groupId: string) => {
    const id = `term-${nextTermIdRef.current++}`;
    setTerms(prev => {
      const newTerms = [...prev];
      const insertIdx = newTerms.findLastIndex(t => t.groupId === groupId) + 1;
      newTerms.splice(insertIdx, 0, { id, name: 'powershell', groupId });
      return newTerms;
    });
    setActiveGroupId(groupId);
  };

  const removeTerminal = (id: string) => {
    let nextActiveGroupId = activeGroupId;
    setTerms(prev => {
      const termToRemove = prev.find(t => t.id === id);
      if (!termToRemove) return prev;
      
      const filtered = prev.filter(t => t.id !== id);
      if (filtered.length === 0) {
        return [];
      }
      
      if (nextActiveGroupId === termToRemove.groupId) {
        const remainingInGroup = filtered.filter(t => t.groupId === termToRemove.groupId);
        if (remainingInGroup.length === 0) {
          nextActiveGroupId = filtered[filtered.length - 1].groupId;
        }
      }
      return filtered;
    });
    
    // We update activeGroupId in a timeout to avoid React state batching issues 
    // when called inside a loop, but wait, setting it outside the callback is safe if we just enqueue it.
    // However, if removeTerminal is called in a loop, nextActiveGroupId might be stale.
    setActiveGroupId(prev => {
      // Just check if current active group still exists after the change
      // It will run after the batch.
      return nextActiveGroupId;
    });
  };

  const removeGroup = (groupId: string) => {
    setTerms(prev => {
      const filtered = prev.filter(t => t.groupId !== groupId);
      if (filtered.length > 0) {
        setActiveGroupId(filtered[filtered.length - 1].groupId);
      }
      return filtered;
    });
  };

  const updateTerminalTitle = (id: string, title: string) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, name: title } : t));
  };
  
  const problems = Object.entries(diagnostics).flatMap(([filePath, markers]) =>
    markers.map(marker => ({ filePath, marker }))
  );

  useEffect(() => {
    if (!requestedTab) return;
    setActiveTab(requestedTab);
    setIsExpanded(true);
  }, [requestedTab, requestId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < window.innerHeight - 100) {
        setPanelHeight(newHeight);
      }
    };
    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };
    if (isDragging) {
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isVisible) return null;

  if (!isExpanded) {
    return (
      <div className="h-8 bg-[#0f0f13] border-t border-white/5 flex items-center justify-between px-4 z-20 shrink-0">
        <div className="flex items-center gap-4 text-xs text-[#8b8b93]">
          <button onClick={() => { setIsExpanded(true); setActiveTab('problems'); }} className="hover:text-white flex items-center gap-1.5"><AlertCircle size={12}/> Problems ({problems.length})</button>
          <button onClick={() => { setIsExpanded(true); setActiveTab('output'); }} className="hover:text-white flex items-center gap-1.5"><Activity size={12}/> Output</button>
          <button onClick={() => { setIsExpanded(true); setActiveTab('terminal'); }} className="hover:text-white flex items-center gap-1.5"><TerminalSquare size={12}/> Terminal</button>
        </div>
        <button onClick={() => setIsExpanded(true)} className="text-[#5b5b63] hover:text-white transition-colors">
          <Maximize2 size={12} />
        </button>
      </div>
    );
  }

  return (
    <div 
      style={{ height: panelHeight }}
      className={cn(
        "bg-[#0f0f13]/95 backdrop-blur-xl border-t border-white/5 flex flex-col z-20 relative shadow-[0_-10px_40px_rgba(0,0,0,0.4)] shrink-0",
        !isDragging && "transition-[height] duration-200 ease-out"
      )}
    >
      <div 
        className="absolute top-[-2px] left-0 right-0 h-[4px] cursor-row-resize hover:bg-blue-500/50 z-30 transition-colors"
        onMouseDown={() => setIsDragging(true)}
      />
      <div className="h-9 flex items-center justify-between px-3 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-1 h-full pt-1">
          {[
            { id: 'problems', icon: AlertCircle, label: 'Problems' },
            { id: 'output', icon: Activity, label: 'Output' },
            { id: 'terminal', icon: TerminalSquare, label: 'Terminal' },
            { id: 'ports', icon: Radio, label: 'Ports' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-4 h-full rounded-t-md text-[11px] font-semibold tracking-wide transition-all flex items-center gap-2 border-b-2",
                activeTab === tab.id 
                  ? "bg-white/5 text-white border-blue-500 shadow-inner" 
                  : "text-[#8b8b93] hover:text-white hover:bg-white/5 border-transparent"
              )}
            >
              <tab.icon size={13} className={activeTab === tab.id ? "text-blue-400" : ""} />
              {tab.label.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pr-2">
          {activeTab === 'terminal' && (
            <div className="flex items-center gap-1 mr-2 border-r border-white/10 pr-2">
              <Tooltip content="New Terminal" align="end">
                <button onClick={addTerminal} className="p-1.5 rounded-md text-[#5b5b63] hover:text-white hover:bg-white/10 transition-colors">
                  <Plus size={14} />
                </button>
              </Tooltip>
              {terms.length > 0 && (
                <>
                  <Tooltip content="Split Terminal" align="end">
                    <button onClick={() => splitTerminal(activeGroupId)} className="p-1.5 rounded-md text-[#5b5b63] hover:text-white hover:bg-white/10 transition-colors">
                      <SplitSquareHorizontal size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Kill Active Group" align="end">
                    <button onClick={() => removeGroup(activeGroupId)} className="p-1.5 rounded-md text-[#5b5b63] hover:text-[#f48771] hover:bg-[#f48771]/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </>
              )}
            </div>
          )}
          <Tooltip content="Maximize Panel" align="end">
            <button onClick={() => setIsExpanded(false)} className="p-1.5 rounded-md text-[#5b5b63] hover:text-white hover:bg-white/10 transition-colors">
              <Minimize2 size={13} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 p-0 overflow-hidden font-mono text-xs text-[#a8a8b1] relative bg-[#08080c] flex">
        {activeTab === 'terminal' && (
          terms.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full w-full gap-4 text-[#5b5b63]">
              <TerminalSquare size={48} className="opacity-20" />
              <div className="flex flex-col items-center gap-1">
                <span className="font-sans text-sm">No active terminals</span>
                <span className="font-sans text-xs opacity-60">Click the + button above to start a new session</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 h-full p-2 relative">
                <TerminalWidget 
                  cwd={projectPath} 
                  terms={terms.filter(t => t.groupId === activeGroupId)}
                  activeTermId={''} // not needed
                  onTitle={updateTerminalTitle}
                />
              </div>
            <div className="w-48 h-full border-l border-white/5 bg-[#0f0f13] flex flex-col overflow-y-auto py-1">
              {Array.from(new Set(terms.map(t => t.groupId))).map(groupId => {
                const groupTerms = terms.filter(t => t.groupId === groupId);
                return groupTerms.map((t, idx) => {
                  const parseTitle = (title: string) => {
                    if (!title) return 'terminal';
                    const parts = title.split('-');
                    let lastPart = parts[parts.length - 1].trim();
                    const pathParts = lastPart.split(/[\\/]/);
                    let name = pathParts[pathParts.length - 1];
                    name = name.replace('.exe', '');
                    if (name === 'cmd' || name === 'powershell' || name === 'bash') return name;
                    const words = name.split(' ');
                    return words[0] || 'terminal';
                  };
                  
                  const displayName = parseTitle(t.name);
                  const isGroupActive = activeGroupId === groupId;
                  
                  let treeType: 'single' | 'first' | 'middle' | 'last' = 'single';
                  if (groupTerms.length > 1) {
                    if (idx === 0) treeType = 'first';
                    else if (idx === groupTerms.length - 1) treeType = 'last';
                    else treeType = 'middle';
                  }

                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveGroupId(groupId)}
                      className={cn(
                        "group w-full text-left pr-1 min-h-[26px] text-[11px] flex items-stretch border-l-2 transition-colors overflow-hidden",
                        isGroupActive ? "border-blue-500 bg-white/5 text-white" : "border-transparent text-[#a8a8b1] hover:bg-white/5",
                        treeType === 'single' ? "pl-3" : "pl-1"
                      )}
                    >
                      {treeType !== 'single' && (
                        <div className="w-3 relative shrink-0">
                          {treeType === 'first' && (
                            <>
                              <div className="absolute top-1/2 bottom-0 left-[50%] w-px bg-[#5b5b63]" />
                              <div className="absolute top-1/2 left-[50%] right-0 h-px bg-[#5b5b63]" />
                            </>
                          )}
                          {treeType === 'middle' && (
                            <>
                              <div className="absolute top-0 bottom-0 left-[50%] w-px bg-[#5b5b63]" />
                              <div className="absolute top-1/2 left-[50%] right-0 h-px bg-[#5b5b63]" />
                            </>
                          )}
                          {treeType === 'last' && (
                            <>
                              <div className="absolute top-0 bottom-1/2 left-[50%] w-px bg-[#5b5b63]" />
                              <div className="absolute top-1/2 left-[50%] right-0 h-px bg-[#5b5b63]" />
                            </>
                          )}
                        </div>
                      )}
                      
                      <div className="flex flex-1 items-center gap-1.5 py-1 min-w-0">
                        <TerminalSquare size={13} className={isGroupActive ? "text-blue-400 shrink-0" : "shrink-0"} />
                        <span className="truncate flex-1">{displayName}</span>
                      </div>
                      
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pl-1">
                        <Tooltip content="Split Terminal" align="end">
                          <div 
                            className="p-1 rounded hover:bg-white/10 transition-colors text-[#5b5b63] hover:text-white"
                            onClick={(e) => { e.stopPropagation(); splitTerminal(groupId); }}
                          >
                            <SplitSquareHorizontal size={11} />
                          </div>
                        </Tooltip>
                        <Tooltip content="Kill Terminal" align="end">
                          <div 
                            className="p-1 rounded hover:bg-white/10 transition-colors text-[#5b5b63] hover:text-[#f48771]"
                            onClick={(e) => { e.stopPropagation(); removeTerminal(t.id); }}
                          >
                            <Trash2 size={11} />
                          </div>
                        </Tooltip>
                      </div>
                    </button>
                  );
                });
              })}
            </div>
          </>
          )
        )}
        {activeTab === 'output' && (
          <div className="h-full overflow-auto p-3 space-y-0.5 whitespace-pre-wrap break-words">
            {outputLines.map((line, index) => (
              <div key={`${index}-${line.text}`} className={cn(
                line.stream === 'stderr' ? 'text-[#f48771]' : line.stream === 'info' ? 'text-[#8b8b93]' : 'text-[#d4d4d4]'
              )}>
                {line.text || ' '}
              </div>
            ))}
          </div>
        )}
        {activeTab === 'problems' && (
          problems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#5b5b63] gap-3">
              <Shield size={32} className="opacity-40" />
              <span className="font-sans text-sm">No problems have been detected in open files.</span>
            </div>
          ) : (
            <div className="h-full overflow-auto py-1">
              {problems.map(({ filePath, marker }, index) => (
                <div key={`${filePath}-${marker.startLineNumber}-${marker.startColumn}-${index}`} className="flex items-start gap-2 px-3 py-1.5 hover:bg-white/5">
                  <AlertCircle size={13} className={marker.severity === 8 ? 'text-[#f48771] mt-0.5' : 'text-[#cca700] mt-0.5'} />
                  <span className="text-[#d4d4d4] flex-1">{marker.message}</span>
                  <span className="text-[#8b8b93] shrink-0">{filePath.split(/[\\/]/).pop()} [{marker.startLineNumber}, {marker.startColumn}]</span>
                </div>
              ))}
            </div>
          )
        )}
        {activeTab === 'ports' && (
          <div className="h-full border-t border-blue-500/20 bg-[#08080c]">
            <PortsTab />
          </div>
        )}
      </div>
    </div>
  );
};

export const IdeContainer: React.FC<IdeContainerProps> = ({ onBack, user }) => {
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isSidebarDragging, setIsSidebarDragging] = useState(false);
  
  const [activeSidebarView, setActiveSidebarView] = useState<'explorer' | 'source-control' | 'environment'>('explorer');
  const [activeProject, setActiveProject] = useState<ProjectFolder | null>(() => {
    const saved = localStorage.getItem('quantix_active_project');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [projects, setProjects] = useState<ProjectFolder[]>(() => {
    const saved = localStorage.getItem('quantix_projects');
    return saved ? JSON.parse(saved) : [];
  });

  const [projectFiles, setProjectFiles] = useState<FileNode[]>([]);
  const [gitStatusMap, setGitStatusMap] = useState<Record<string, string>>({});
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  
  const [splitOpenFiles, setSplitOpenFiles] = useState<OpenFile[]>([]);
  const [splitActiveFilePath, setSplitActiveFilePath] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');
  

  const [diagnostics, setDiagnostics] = useState<DiagnosticsByPath>({});
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [bottomPanelRequest, setBottomPanelRequest] = useState<{ tab: 'problems' | 'output' | 'terminal' | null; id: number }>({ tab: null, id: 0 });

  // Dropdown & Wizard States
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<'create' | 'security' | 'name'>('create');
  const [wizardProjectName, setWizardProjectName] = useState('');
  const [wizardFolders, setWizardFolders] = useState<any[]>([]);
  const [selectedSecurity, setSelectedSecurity] = useState<'full' | 'user' | 'semi'>('full');

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: FileNode } | null>(null);

  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectFolder | null>(null);

  const [nodeToRename, setNodeToRename] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [nodeToDelete, setNodeToDelete] = useState<FileNode | null>(null);
  const [nodeToCreate, setNodeToCreate] = useState<{ parentNode: FileNode, type: 'file' | 'folder' } | null>(null);
  const [createValue, setCreateValue] = useState('');

  // Tree multi-selection state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
      setIsDragSelecting(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const handleNodeSelect = (node: FileNode, toggle: boolean) => {
    setSelectedPaths(prev => {
      const next = new Set(toggle ? prev : undefined);
      if (toggle && next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  };

  const handleNodeDown = (node: FileNode) => {
    dragTimeoutRef.current = setTimeout(() => {
      setIsDragSelecting(true);
      setSelectedPaths(prev => {
        const next = new Set(prev);
        next.add(node.path);
        return next;
      });
    }, 400); // 400ms for long press to start selection
  };

  const handleNodeEnter = (node: FileNode) => {
    if (isDragSelecting) {
      setSelectedPaths(prev => {
        const next = new Set(prev);
        next.add(node.path);
        return next;
      });
    }
  };

  const handleNodeUp = () => {
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    setIsDragSelecting(false);
  };

  // Undo/Redo States
  const [undoStack, setUndoStack] = useState<{ type: 'move', sourcePath: string, targetPath: string }[]>([]);
  const [redoStack, setRedoStack] = useState<{ type: 'move', sourcePath: string, targetPath: string }[]>([]);

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

  const handleRunFile = async (filePath: string, fileName: string) => {
    if (!activeProject?.path) return;
    if (isHtmlFile(fileName)) {
      await handleRunLive();
      return;
    }

    try {
      const command = await (window as any).electron.getRunCommandForFile(filePath, activeProject.path);
      if (command) {
        setBottomPanelRequest(previous => ({ tab: 'terminal', id: previous.id + 1 }));
        await (window as any).electron.sendTerminalData(command + '\r');
      } else {
        setOutputLines([{ text: `No code runner is configured for this file type.`, stream: 'stderr' }]);
        setBottomPanelRequest(previous => ({ tab: 'output', id: previous.id + 1 }));
      }
    } catch (error) {
      setOutputLines([{ text: error instanceof Error ? error.message : String(error), stream: 'stderr' }]);
      setBottomPanelRequest(previous => ({ tab: 'output', id: previous.id + 1 }));
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

  // Check live server status on mount
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await (window as any).electron.checkLiveServer();
        if (res && res.isRunning) {
          setIsLiveServerRunning(true);
        }
      } catch (e) {
        // ignore
      }
    };
    checkServer();
  }, []);

  const fetchProjectFiles = async () => {
    if (activeProject && activeProject.path) {
      const data = await (window as any).electron.readProjectFiles(activeProject.path);
      setProjectFiles(data || []);
      
      try {
        const res = await (window as any).electron.gitStatus(activeProject.path);
        if (res && res.data) {
          const map: Record<string, string> = {};
          res.data.split('\n').filter((l: string) => l.trim()).forEach((line: string) => {
            const status = line.substring(0, 2).trim();
            const path = line.substring(3).trim();
            map[path] = status;
          });
          setGitStatusMap(map);
        } else {
          setGitStatusMap({});
        }
      } catch(e) {
        setGitStatusMap({});
      }
    } else {
      setProjectFiles([]);
      setGitStatusMap({});
    }
  };

  useEffect(() => {
    fetchProjectFiles();
  }, [activeProject]);

  useEffect(() => {
    const handleRestore = () => { fetchProjectFiles(); };
    window.addEventListener('project-files-restored', handleRestore);
    return () => window.removeEventListener('project-files-restored', handleRestore);
  }, [activeProject]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSidebarDragging) return;
      // Activity bar is ~48px wide.
      // So width is e.clientX - 48
      const newWidth = e.clientX - 48;
      if (newWidth > 150 && newWidth < window.innerWidth / 2) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      if (isSidebarDragging) setIsSidebarDragging(false);
    };
    if (isSidebarDragging) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSidebarDragging]);

  const handleMoveFile = async (sourcePath: string, targetDirPath: string, isUndoRedo = false) => {
    if (!sourcePath || !targetDirPath) return;
    const separator = sourcePath.includes('\\') ? '\\' : '/';
    if (targetDirPath.startsWith(sourcePath + separator) || sourcePath === targetDirPath) return;
    
    const fileName = sourcePath.split(/[\\/]/).pop();
    if (!fileName) return;
    const newPath = targetDirPath + separator + fileName;
    if (sourcePath === newPath) return;

    const res = await (window as any).electron.renameFile(sourcePath, newPath, activeProject?.path);
    if (res.success) {
      if (!isUndoRedo) {
        setUndoStack(prev => [...prev, { type: 'move', sourcePath, targetPath: newPath }]);
        setRedoStack([]);
      }
      fetchProjectFiles();
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    if (action.type === 'move') {
      await (window as any).electron.renameFile(action.targetPath, action.sourcePath, activeProject?.path);
      setRedoStack(prev => [...prev, action]);
      fetchProjectFiles();
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    if (action.type === 'move') {
      await (window as any).electron.renameFile(action.sourcePath, action.targetPath, activeProject?.path);
      setUndoStack(prev => [...prev, action]);
      fetchProjectFiles();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + Alt + R -> Reveal in File Explorer
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'r') {
        if (activeFilePath) {
          (window as any).electron.showItemInFolder(activeFilePath);
        } else if (activeProject?.path) {
          (window as any).electron.showItemInFolder(activeProject.path);
        }
      }
      // Undo/Redo shortcuts (global if no input field is active)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, activeProject, undoStack, redoStack]);

  const handleFileClick = async (node: FileNode) => {
    if (node.type === 'file') {
      const targetFiles = activePane === 'right' ? splitOpenFiles : openFiles;
      const setTargetFiles = activePane === 'right' ? setSplitOpenFiles : setOpenFiles;
      const setTargetActive = activePane === 'right' ? setSplitActiveFilePath : setActiveFilePath;
      
      const existing = targetFiles.find(f => f.path === node.path && !f.isDiff);
      if (existing) {
        setTargetActive(node.path);
        return;
      }
      
      const content = await (window as any).electron.readFileContent(node.path, activeProject?.path);
      if (content !== undefined && content !== null) {
        setTargetFiles(prev => [...prev, {
          path: node.path,
          name: node.name,
          originalContent: content
        }]);
        setTargetActive(node.path);
      }
    }
  };

  const handleSplitEditor = () => {
    if (activeFilePath) {
      const activeFile = openFiles.find(f => f.path === activeFilePath);
      if (activeFile && !splitOpenFiles.find(f => f.path === activeFilePath)) {
        setSplitOpenFiles(prev => [...prev, activeFile]);
      }
      setSplitActiveFilePath(activeFilePath);
      setActivePane('right');
    }
  };

  const handleFileDiff = async (relativePath: string) => {
    if (!activeProject) return;
    try {
      const fullPath = relativePath.includes('/') || relativePath.includes('\\') 
        ? `${activeProject.path}/${relativePath}` 
        : `${activeProject.path}/${relativePath}`; 
        
      const diffId = `diff://${relativePath}`;
      
      const targetFiles = activePane === 'right' ? splitOpenFiles : openFiles;
      const setTargetFiles = activePane === 'right' ? setSplitOpenFiles : setOpenFiles;
      const setTargetActive = activePane === 'right' ? setSplitActiveFilePath : setActiveFilePath;
      
      const existing = targetFiles.find(f => f.path === diffId);
      if (existing) {
        setTargetActive(diffId);
        return;
      }
      
      const originalRes = await (window as any).electron.gitShowFile(activeProject.path, relativePath, 'HEAD');
      let originalContent = '';
      if (originalRes.success) {
        originalContent = originalRes.data;
      }
      
      let modifiedContent = '';
      try {
        modifiedContent = await (window as any).electron.readFileContent(relativePath, activeProject.path);
      } catch(e) {}
      
      if (modifiedContent !== undefined && modifiedContent !== null) {
        setTargetFiles(prev => [...prev, {
          path: diffId,
          name: `${relativePath.split('/').pop() || relativePath.split('\\').pop()} (Working Tree)`,
          originalContent: modifiedContent,
          isDiff: true,
          diffOriginalContent: originalContent
        }]);
        setTargetActive(diffId);
      }
    } catch (e: any) {
      console.error(e);
      alert('Error opening diff: ' + e.message);
    }
  };

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
    } else if (wizardStep === 'security') {
      if (wizardFolders.length > 0) {
        setWizardProjectName(wizardFolders[0].name || '');
      }
      setWizardStep('name');
    } else {
      if (wizardFolders.length > 0) {
        const createProject = async () => {
          let projectPath = wizardFolders[0].path;
          let projectName = wizardProjectName.trim() || wizardFolders[0].name;

          if (wizardFolders.length > 1) {
            // Create a virtual workspace combining multiple folders
            projectPath = await (window as any).electron.createVirtualWorkspace(projectName, wizardFolders);
          } else {
            // Keep original behavior for single folder
            if (wizardProjectName.trim() && wizardProjectName.trim() !== wizardFolders[0].name) {
              projectName = wizardProjectName.trim();
            }
          }

          const newProject = {
            path: projectPath,
            name: projectName,
            branch: wizardFolders.length > 1 ? null : wizardFolders[0].branch
          };

          const updatedProjects = [...projects];
          if (!updatedProjects.some(p => p.path === newProject.path)) {
            updatedProjects.push(newProject);
          }

          setActiveProject(newProject);
          localStorage.setItem('quantix_active_project', JSON.stringify(newProject));
          setProjects(updatedProjects);
          localStorage.setItem('quantix_projects', JSON.stringify(updatedProjects));
          
          setShowWizard(false);
          setWizardFolders([]);
        };
        createProject();
        return; // Early return since we're handling state updates async
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
      setOpenFiles([]);
      setActiveFilePath(null);
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

  const getContextMenuItems = (node: FileNode) => {
    const isFile = node.type === 'file';
    const items: ContextMenuItem[] = [];
    
    if (!isFile) {
      items.push(
        { label: 'Create New File', onClick: () => {
          setNodeToCreate({ parentNode: node, type: 'file' });
          setCreateValue('');
        } },
        { label: 'Create New Folder', onClick: () => {
          setNodeToCreate({ parentNode: node, type: 'folder' });
          setCreateValue('');
        } },
        { divider: true, label: '', onClick: () => {} }
      );
    }
    
    items.push(
      { label: 'Reveal in File Explorer', shortcut: 'Shift+Alt+R', onClick: () => {
        (window as any).electron.showItemInFolder(node.path);
      } },
      { label: 'Open in Integrated Terminal', onClick: () => console.log('Terminal', node.path) },
      { divider: true, label: '', onClick: () => {} }
    );
  
    if (isFile) {
      items.push({ label: 'Find File References', onClick: () => console.log('Find References', node.path) });
      items.push({ divider: true, label: '', onClick: () => {} });
    }
  
    items.push(
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => console.log('Cut', node.path) },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => console.log('Copy', node.path) },
      { divider: true, label: '', onClick: () => {} },
      { label: 'Copy Path', shortcut: 'Shift+Alt+C', onClick: () => {
        navigator.clipboard.writeText(node.path);
      } },
      { label: 'Copy Relative Path', shortcut: 'Ctrl+K Ctrl+Shift+C', onClick: () => {
        if (activeProject) {
          const relative = node.path.replace(activeProject.path, '').replace(/^[\\\/]/, '');
          navigator.clipboard.writeText(relative);
        }
      } },
      { divider: true, label: '', onClick: () => {} },
      { label: 'Rename...', shortcut: 'F2', onClick: () => {
        setNodeToRename(node);
        setRenameValue(node.name);
      } },
      { label: 'Delete', shortcut: 'Delete', onClick: () => {
        setNodeToDelete(node);
      } }
    );
    return items;
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  return (
    <div className="w-full h-screen flex flex-col bg-[#08080c] text-[#e2e2e3] select-none relative z-50 overflow-hidden">
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={getContextMenuItems(contextMenu.node)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
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
      <TitleBar userName={user?.name} userAvatar={user?.avatar} />

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
            <img src="./icon.png" alt="QUANTIX Logo" className="w-3.5 h-3.5 object-contain" />
            Close QUANTIX IDE
          </button>
          <div className="w-[30px] h-[30px]" />
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 flex overflow-hidden pt-[88px]">
        {/* Activity Bar */}
        <ActivityBar 
          activeView={activeSidebarView} 
          onViewChange={setActiveSidebarView} 
          gitChangesCount={Object.keys(gitStatusMap).length}
        />

        {/* Left File Explorer Panel */}
        <div 
          style={{ width: explorerOpen ? sidebarWidth : 0 }}
          className={cn(
            "border-r border-white/5 bg-[#0f0f13] flex flex-col py-3 select-none overflow-hidden relative shrink-0",
            !isSidebarDragging && "transition-[width] duration-300 ease-in-out",
            !explorerOpen && "border-r-0"
          )}
        >
          <div 
            className="absolute top-0 bottom-0 right-[-2px] w-[4px] cursor-col-resize hover:bg-blue-500/50 z-30 transition-colors"
            onMouseDown={() => setIsSidebarDragging(true)}
          />
          {activeSidebarView === 'explorer' ? (
            <>
              <div className="px-4 mb-2 flex items-center justify-between relative" ref={dropdownRef}>
            <span className="text-[11px] font-bold tracking-wider text-[#8b8b93] uppercase">
              Project Files
            </span>
            <div className="flex items-center gap-1">
              <Tooltip content="Undo (Ctrl+Z)"><button
                  onClick={() => undoStack.length > 0 && handleUndo()}
                  aria-disabled={undoStack.length === 0}
                  className={cn("p-1 rounded transition-colors", undoStack.length > 0 ? "text-[#8b8b93] hover:text-white hover:bg-white/5" : "text-[#8b8b93]/30 cursor-not-allowed")}>
                  <Undo2 size={14} />
                </button></Tooltip>
              <Tooltip content="Redo (Ctrl+Y)"><button
                  onClick={() => redoStack.length > 0 && handleRedo()}
                  aria-disabled={redoStack.length === 0}
                  className={cn("p-1 rounded transition-colors", redoStack.length > 0 ? "text-[#8b8b93] hover:text-white hover:bg-white/5" : "text-[#8b8b93]/30 cursor-not-allowed")}>
                  <Redo2 size={14} />
                </button></Tooltip>
              <Tooltip content="Projects">
                <button 
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors"
                >
                  <FolderPlus size={14} />
                </button>
              </Tooltip>
            </div>

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
                              setOpenFiles([]);
                              setActiveFilePath(null);
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
                onContextMenu={handleContextMenu}
                selectedPath={activeFilePath} 
                selectedPaths={selectedPaths}
                onNodeSelect={handleNodeSelect}
                onNodeDown={handleNodeDown}
                onNodeUp={handleNodeUp}
                onNodeEnter={handleNodeEnter}
                isDragSelecting={isDragSelecting}
                depth={0}
                defaultOpen={true}
                onMoveFile={handleMoveFile}
                gitStatusMap={gitStatusMap}
              />
            ) : (
              <div className="px-4 py-2 text-[#8b8b93] italic">No project loaded</div>
            )}
          </div>
            </>
          ) : activeSidebarView === 'source-control' ? (
            <SourceControl 
              projectPath={activeProject?.path} 
              onFileDiff={handleFileDiff}
              gitStatusMap={gitStatusMap}
              onGitAction={async () => {
                await fetchProjectFiles();
                
                // Refresh all open files from disk to drop unsaved discarded changes
                const newOpenFiles = await Promise.all(openFiles.map(async file => {
                  try {
                    const content = await (window as any).electron.readFileContent(file.path, activeProject?.path);
                    return { ...file, originalContent: content };
                  } catch (e) {
                    return file;
                  }
                }));
                setOpenFiles(newOpenFiles);
              }}
            />
          ) : (
            <EnvironmentManagerView 
              projectRoot={activeProject?.path} 
              onOpenPythonTab={() => {
                const path = 'ide://python-env';
                if (!openFiles.find(f => f.path === path)) {
                  setOpenFiles(prev => [...prev, {
                    path,
                    name: 'Python',
                    originalContent: ''
                  }]);
                }
                setActiveFilePath(path);
              }}
              onOpenJavaTab={() => {
                const path = 'ide://java-env';
                if (!openFiles.find(f => f.path === path)) {
                  setOpenFiles(prev => [...prev, { path, name: 'Java', originalContent: '' }]);
                }
                setActiveFilePath(path);
              }}
              onOpenJavaFXTab={() => {
                const path = 'ide://javafx-env';
                if (!openFiles.find(f => f.path === path)) {
                  setOpenFiles(prev => [...prev, { path, name: 'JavaFX', originalContent: '' }]);
                }
                setActiveFilePath(path);
              }}
            />
          )}
        </div>
        <div className={cn("flex-1 flex flex-col overflow-hidden transition-colors", (openFiles.length > 0 || splitOpenFiles.length > 0) ? "bg-[#08080c]" : "bg-transparent")}>
          {(openFiles.length > 0 || splitOpenFiles.length > 0) ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Left Pane */}
              <div 
                className={cn("flex-1 flex flex-col overflow-hidden relative", activePane === 'left' ? "ring-1 ring-blue-500/20 z-10" : "opacity-90")}
                onClick={() => setActivePane('left')}
              >
                {openFiles.length > 0 ? (
                  <EditorArea 
                    projectRoot={activeProject?.path}
                    openFiles={openFiles}
                    activeFilePath={activeFilePath}
                    isLiveServerRunning={isLiveServerRunning}
                    onTabClose={(path) => {
                      setDiagnostics(previous => {
                        const next = { ...previous };
                        delete next[path];
                        return next;
                      });
                      setOpenFiles(prev => {
                        const filtered = prev.filter(f => f.path !== path);
                        if (activeFilePath === path) {
                          setActiveFilePath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
                        }
                        return filtered;
                      });
                    }}
                    onTabClick={(path) => {
                      setActiveFilePath(path);
                      setActivePane('left');
                    }}
                    handleRunFile={handleRunFile}
                    handleStopLive={handleStopLive}
                    onFileSaved={(path, newContent) => {
                      setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, originalContent: newContent } : f));
                      setSplitOpenFiles(prev => prev.map(f => f.path === path ? { ...f, originalContent: newContent } : f));
                      fetchProjectFiles();
                    }}
                    onDiagnosticsChange={(path, markers) => {
                      setDiagnostics(previous => ({ ...previous, [path]: markers }));
                      if (markers.some(marker => marker.severity === 8)) {
                        setBottomPanelRequest(previous => ({ tab: 'problems', id: previous.id + 1 }));
                      }
                    }}
                    gitStatusMap={gitStatusMap}
                    onTabsReorder={setOpenFiles}
                    onSplitEditor={handleSplitEditor}
                    isActivePane={activePane === 'left'}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#8b8b93] text-sm select-none">
                    No files open in this group
                  </div>
                )}
              </div>

              {/* Right Pane */}
              {splitOpenFiles.length > 0 && (
                <div 
                  className={cn("flex-1 flex flex-col overflow-hidden relative border-l border-white/10", activePane === 'right' ? "ring-1 ring-blue-500/20 z-10" : "opacity-90")}
                  onClick={() => setActivePane('right')}
                >
                  <EditorArea 
                    projectRoot={activeProject?.path}
                    openFiles={splitOpenFiles}
                    activeFilePath={splitActiveFilePath}
                    isLiveServerRunning={isLiveServerRunning}
                    onTabClose={(path) => {
                      setSplitOpenFiles(prev => {
                        const filtered = prev.filter(f => f.path !== path);
                        if (splitActiveFilePath === path) {
                          setSplitActiveFilePath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
                        }
                        if (filtered.length === 0) setActivePane('left');
                        return filtered;
                      });
                    }}
                    onTabClick={(path) => {
                      setSplitActiveFilePath(path);
                      setActivePane('right');
                    }}
                    handleRunFile={handleRunFile}
                    handleStopLive={handleStopLive}
                    onFileSaved={(path, newContent) => {
                      setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, originalContent: newContent } : f));
                      setSplitOpenFiles(prev => prev.map(f => f.path === path ? { ...f, originalContent: newContent } : f));
                      fetchProjectFiles();
                    }}
                    onDiagnosticsChange={(path, markers) => {
                      setDiagnostics(previous => ({ ...previous, [path]: markers }));
                    }}
                    gitStatusMap={gitStatusMap}
                    onTabsReorder={setSplitOpenFiles}
                    isActivePane={activePane === 'right'}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-[#8b8b93] select-none">
              <motion.img 
                initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                src="./icon.png"
                alt="QUANTIX Logo" 
                className="w-20 h-20 object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.6)] mb-4"
              />
              <BlurText text="QUANTIX IDE" className="text-xl font-bold text-white tracking-wider" delay={0.2} />
              <BlurText text="Your intelligent code environment" className="text-xs text-[#6b6b73] mt-1 mb-4" delay={0.6} />
              
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
          
          <BottomPanel
            projectPath={activeProject?.path}
            diagnostics={diagnostics}
            outputLines={outputLines}
            requestedTab={bottomPanelRequest.tab}
            requestId={bottomPanelRequest.id}
          />
        </div>
      </div>

      <EnvironmentTaskStatusBar />

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

              {/* Wizard Step 3: Project Name */}
              {wizardStep === 'name' && (
                <>
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-white">Project Name</h3>
                      <p className="text-[10px] text-[#8b8b93] mt-0.5">Set a name for this project</p>
                    </div>
                    <button 
                      onClick={handleSkip}
                      className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-6">
                    <input
                      type="text"
                      value={wizardProjectName}
                      onChange={(e) => setWizardProjectName(e.target.value)}
                      placeholder="Enter project name"
                      autoFocus
                      className="w-full bg-[#08080c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#007acc] transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleNextStep();
                        }
                      }}
                    />
                  </div>
                  <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-between gap-3">
                    <button
                      onClick={() => setWizardStep('security')}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleNextStep}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-colors"
                    >
                      Finish
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {nodeToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[400px] bg-[#18181f] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/5 bg-[#14141a]">
                <h3 className="text-sm font-semibold text-white">Delete {nodeToDelete.type === 'file' ? 'File' : 'Folder'}</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-[#8b8b93] leading-relaxed">
                  Are you sure you want to delete <span className="text-white font-medium break-all">{nodeToDelete.path}</span>?
                  <br />
                  <span className="text-red-400 mt-2 block font-medium">This action cannot be undone.</span>
                </p>
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => setNodeToDelete(null)}
                    className="px-4 py-2 rounded-md text-xs font-semibold text-[#8b8b93] hover:text-white hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const res = await (window as any).electron.deleteFile(nodeToDelete.path, activeProject?.path);
                      if (res.success) {
                        fetchProjectFiles();
                        setOpenFiles(prev => prev.filter(f => !f.path.startsWith(nodeToDelete.path)));
                        if (activeFilePath && activeFilePath.startsWith(nodeToDelete.path)) {
                          setActiveFilePath(null);
                        }
                        setNodeToDelete(null);
                      } else {
                        console.error('Failed to delete:', res.error);
                      }
                    }}
                    className="px-4 py-2 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {nodeToCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[400px] bg-[#18181f] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/5 bg-[#14141a]">
                <h3 className="text-sm font-semibold text-white">Create New {nodeToCreate.type === 'file' ? 'File' : 'Folder'}</h3>
                <p className="text-xs text-[#8b8b93] mt-1 break-all">
                  In: {nodeToCreate.parentNode.path}
                </p>
              </div>
              <div className="p-5">
                <input
                  autoFocus
                  type="text"
                  value={createValue}
                  onChange={e => setCreateValue(e.target.value)}
                  placeholder={`Enter ${nodeToCreate.type} name...`}
                  className="w-full bg-[#08080c] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      if (!createValue.trim()) return;
                      const res = nodeToCreate.type === 'file'
                        ? await (window as any).electron.createFile(nodeToCreate.parentNode.path, createValue.trim(), activeProject?.path)
                        : await (window as any).electron.createFolder(nodeToCreate.parentNode.path, createValue.trim(), activeProject?.path);
                      
                      if (res.success) {
                        fetchProjectFiles();
                        setNodeToCreate(null);
                      } else {
                        console.error('Failed to create:', res.error);
                      }
                    } else if (e.key === 'Escape') {
                      setNodeToCreate(null);
                    }
                  }}
                />
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => setNodeToCreate(null)}
                    className="px-4 py-2 rounded-md text-xs font-semibold text-[#8b8b93] hover:text-white hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!createValue.trim()}
                    onClick={async () => {
                      if (!createValue.trim()) return;
                      const res = nodeToCreate.type === 'file'
                        ? await (window as any).electron.createFile(nodeToCreate.parentNode.path, createValue.trim(), activeProject?.path)
                        : await (window as any).electron.createFolder(nodeToCreate.parentNode.path, createValue.trim(), activeProject?.path);
                      
                      if (res.success) {
                        fetchProjectFiles();
                        setNodeToCreate(null);
                      } else {
                        console.error('Failed to create:', res.error);
                      }
                    }}
                    className="px-4 py-2 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {nodeToRename && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#18181f] border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 pb-4">
                <h3 className="text-lg font-bold text-white mb-4">Rename {nodeToRename.type === 'file' ? 'File' : 'Folder'}</h3>
                <input 
                  type="text" 
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameValue && renameValue !== nodeToRename.name) {
                      const newPath = nodeToRename.path.substring(0, nodeToRename.path.lastIndexOf(nodeToRename.name)) + renameValue;
                      await (window as any).electron.renameFile(nodeToRename.path, newPath, activeProject?.path);
                      fetchProjectFiles();
                      setNodeToRename(null);
                    } else if (e.key === 'Escape') {
                      setNodeToRename(null);
                    }
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setNodeToRename(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (renameValue && renameValue !== nodeToRename.name) {
                      const newPath = nodeToRename.path.substring(0, nodeToRename.path.lastIndexOf(nodeToRename.name)) + renameValue;
                      await (window as any).electron.renameFile(nodeToRename.path, newPath, activeProject?.path);
                      fetchProjectFiles();
                      setNodeToRename(null);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-colors"
                >
                  Rename
                </button>
              </div>
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
  onContextMenu,
  selectedPath,
  selectedPaths,
  onNodeSelect,
  onNodeDown,
  onNodeUp,
  onNodeEnter,
  isDragSelecting,
  depth = 0,
  defaultOpen = false,
  onMoveFile,
  gitStatusMap
}: { 
  node: FileNode; 
  onFileClick: (n: FileNode) => void; 
  onContextMenu?: (e: React.MouseEvent, n: FileNode) => void;
  selectedPath: string | null; 
  selectedPaths?: Set<string>;
  onNodeSelect?: (node: FileNode, toggle: boolean) => void;
  onNodeDown?: (node: FileNode) => void;
  onNodeUp?: () => void;
  onNodeEnter?: (node: FileNode) => void;
  isDragSelecting?: boolean;
  depth?: number;
  defaultOpen?: boolean;
  onMoveFile?: (sourcePath: string, targetPath: string) => void;
  gitStatusMap?: Record<string, string>;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const paddingLeft = depth * 14 + 8;
  const iconCenter = paddingLeft + 7;

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-file-path', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourcePath = e.dataTransfer.getData('application/x-file-path');
    if (sourcePath && onMoveFile) {
      const targetDir = node.type === 'folder' 
        ? node.path 
        : node.path.substring(0, Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\')));
      if (targetDir) {
        onMoveFile(sourcePath, targetDir);
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNodeUp) onNodeUp();

    if (e.ctrlKey || e.metaKey) {
      onNodeSelect?.(node, true);
      return;
    }

    onNodeSelect?.(node, false);
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      onFileClick(node);
    }
  };

  const isSelected = selectedPaths ? selectedPaths.has(node.path) : selectedPath === node.path;
  const normalizedPath = node.path.replace(/\\/g, '/');
  const gitStatusKey = gitStatusMap ? Object.keys(gitStatusMap).find(k => normalizedPath.endsWith(k)) : undefined;
  const gitStatus = gitStatusKey ? gitStatusMap[gitStatusKey] : undefined;

  const isModified = gitStatus?.includes('M');
  const isUntracked = gitStatus?.includes('?') || gitStatus?.includes('A');
  
  const textColorClass = isModified ? "text-[#e2c08d]" 
                       : isUntracked ? "text-[#73c991]" 
                       : isSelected ? "text-white" 
                       : "text-[#a8a8b1]";

  if (node.type === 'folder') {
    return (
      <div>
        <div 
          onClick={handleClick}
          onMouseDown={() => onNodeDown?.(node)}
          onMouseUp={() => onNodeUp?.()}
          onMouseEnter={() => onNodeEnter?.(node)}
          onContextMenu={(e) => onContextMenu && onContextMenu(e, node)}
          draggable={!isDragSelecting}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{ paddingLeft: `${paddingLeft}px` }}
          className={cn(
            "flex items-center gap-1.5 py-1.5 rounded-md cursor-pointer relative z-10 group transition-colors",
            isSelected ? "bg-[#007acc]/30 font-medium shadow-[inset_2px_0_0_0_#007acc]" : "hover:bg-white/5",
            textColorClass
          )}
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
                    className="absolute bg-[#3a71c1]"
                    style={{ 
                      left: `${iconCenter}px`, 
                      top: 0,
                      bottom: index === node.children.length - 1 ? 'calc(100% - 13px)' : 0,
                      width: '1px'
                    }}
                  />
                  <div 
                    className="absolute bg-[#3a71c1]"
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
                    onContextMenu={onContextMenu}
                    selectedPath={selectedPath} 
                    selectedPaths={selectedPaths}
                    onNodeSelect={onNodeSelect}
                    onNodeDown={onNodeDown}
                    onNodeUp={onNodeUp}
                    onNodeEnter={onNodeEnter}
                    isDragSelecting={isDragSelecting}
                    depth={depth + 1}
                    onMoveFile={onMoveFile}
                    gitStatusMap={gitStatusMap}
                  />
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      onClick={handleClick}
      onMouseDown={() => onNodeDown?.(node)}
      onMouseUp={() => onNodeUp?.()}
      onMouseEnter={() => onNodeEnter?.(node)}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, node)}
      draggable={!isDragSelecting}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ paddingLeft: `${paddingLeft}px` }}
      className={cn(
        "flex items-center gap-2 py-1.5 rounded-md cursor-pointer transition-colors relative z-10 group",
        isSelected ? "bg-[#007acc]/30 font-medium shadow-[inset_2px_0_0_0_#007acc]" : "hover:bg-white/5",
        textColorClass
      )}
    >
      <FileIcon filename={node.name} size={14} className="shrink-0" />
      <span className="truncate flex-1">{node.name}</span>
      {gitStatus && (
        <span className={cn(
          "text-[9.5px] font-bold px-1 rounded ml-2 shrink-0 flex items-center justify-center opacity-80",
          isModified ? "text-[#e2c08d]" : isUntracked ? "text-[#73c991]" : "text-[#f48771]"
        )}>
          {gitStatus.includes('?') ? 'U' : gitStatus.trim()[0]}
        </span>
      )}
    </div>
  );
};

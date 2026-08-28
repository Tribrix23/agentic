import React, { useState, useEffect } from 'react';
import { 
  X, Activity, Layers, FileText, FilePen, Terminal, GitBranch, 
  Search, Brain, RotateCcw, AlertCircle, ListTodo, Trash2, FileCode,
  Maximize2, RefreshCw, SquareTerminal, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../App';
import { TodoListPanel } from './chat/TodoListPanel';
import { Task } from '../lib/taskStore';
import { CodeBlock } from './chat/CodeBlock';
import { FileIcon } from './chat/FileIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { SubagentHandle } from '../lib/agent/subagentTypes';

export interface TokenBudget {
  total: number;
  systemPrompt: number;
  tools: number;
  projectContext: number;
  conversationHistory: number;
  responseReserved: number;
  available: number;
  utilizationPercent: number;
}

export function formatTokenCount(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
}

export interface AgentActivity {
  id: string; 
  timestamp: number; 
  type: string; 
  toolName?: string;
  description: string; 
  status: 'running' | 'completed' | 'error'; 
  durationMs?: number;
  fileName?: string;
  filePath?: string;
  callId?: string;
  actorKind?: 'main' | 'subagent';
  actorRole?: string;
  conversationId?: string;
  runId?: string;
  turnId?: string;
  progress?: { added?: number; removed?: number };
}

export interface FileChange {
  path: string;
  type: 'modified' | 'created' | 'deleted';
  content?: string;
}

interface RightSidebarProps {
  isOpen: boolean;
  toggle: () => void;
  agentActivity?: AgentActivity[];
  filesChanged?: FileChange[];
  tokenBudget?: TokenBudget;
  onRevertFile?: (path: string) => void;
  onOpenFile?: (path: string) => void;
  onClearFile?: (path: string) => void;
  tasks?: Task[];
  subagents?: SubagentHandle[];
  onTaskClick?: (task: Task) => void;
  conversationId?: string;
  onClearTasks?: () => void;
}

type TabType = 'activity' | 'files' | 'implementation' | 'tasks';

const getActivityIcon = (type: string, toolName?: string) => {
  const t = (toolName || type).toLowerCase();
  if (t.includes('coding')) return <FilePen className="w-4 h-4 text-green-400 animate-pulse" />;
  if (t.includes('read') || t.includes('view')) return <FileText className="w-4 h-4 text-blue-400" />;
  if (t.includes('write') || t.includes('edit')) return <FilePen className="w-4 h-4 text-green-400" />;
  if (t.includes('run') || t.includes('terminal')) return <Terminal className="w-4 h-4 text-yellow-400" />;
  if (t.includes('git')) return <GitBranch className="w-4 h-4 text-purple-400" />;
  if (t.includes('search') || t.includes('find')) return <Search className="w-4 h-4 text-cyan-400" />;
  if (t.includes('think') || t.includes('plan')) return <Brain className="w-4 h-4 text-pink-400" />;
  return <Activity className="w-4 h-4 text-white/50" />;
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
};

export const RightSidebar = ({ 
  isOpen, toggle, agentActivity = [], filesChanged = [], tokenBudget, onRevertFile, onOpenFile, onClearFile, tasks = [], subagents = [], onTaskClick, conversationId, onClearTasks
}: RightSidebarProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [implementationPath, setImplementationPath] = useState<string | null>(null);
  const [implementationContent, setImplementationContent] = useState('');
  const [agentModeActive, setAgentModeActive] = useState(false);

  useEffect(() => {
    const handleOpenImplementation = async (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (!path) return;
      setImplementationPath(path);
      setActiveTab('implementation');
      try {
        const content = await (window as any).electron.readFileContent(path);
        setImplementationContent(typeof content === 'string' ? content : 'Unable to read implementation plan.');
      } catch {
        setImplementationContent('Unable to read implementation plan.');
      }
    };
    window.addEventListener('open-implementation-plan', handleOpenImplementation);
    return () => window.removeEventListener('open-implementation-plan', handleOpenImplementation);
  }, []);

  useEffect(() => {
    const handleModeChanged = (event: Event) => {
      const isAgent = (event as CustomEvent<{ mode?: string }>).detail?.mode === 'agent';
      setAgentModeActive(isAgent);
      if (isAgent && implementationPath) {
        window.dispatchEvent(new CustomEvent('proceed-implementation-plan', {
          detail: { path: implementationPath, content: implementationContent },
        }));
      }
    };
    window.addEventListener('interaction-mode-changed', handleModeChanged);
    return () => {
      window.removeEventListener('interaction-mode-changed', handleModeChanged);
    };
  }, [implementationPath, implementationContent]);

  useEffect(() => {
    const handleOpenSidebarFile = (e: any) => {
      setActiveTab('files');
      if (e.detail?.path) {
        setExpandedFiles(prev => new Set(prev).add(e.detail.path));
      }
    };
    window.addEventListener('open-sidebar-file', handleOpenSidebarFile);
    return () => window.removeEventListener('open-sidebar-file', handleOpenSidebarFile);
  }, []);

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className={cn(
      "h-full bg-[#0f0f13] border-white/5 flex flex-col flex-shrink-0 z-10 transition-all duration-300 ease-in-out overflow-hidden font-mono text-sm",
      isOpen ? "w-[480px] border-l" : "w-0 border-l-0"
    )}>
      <div className="w-[480px] h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-14 pb-4 border-b border-white/5 shrink-0">
          <div className="flex space-x-6">
            <button 
              onClick={() => setActiveTab('tasks')}
              className={cn("flex items-center space-x-2 pb-1 border-b-2 transition-colors", activeTab === 'tasks' ? "border-[#7C3AED] text-white" : "border-transparent text-white/40 hover:text-white/70")}
            >
              <ListTodo className="w-4 h-4" />
              <span>Tasks</span>
            </button>
            {activeTab === 'tasks' && onClearTasks && (
              <button
                onClick={onClearTasks}
                className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
                title="Clear all tasks"
              >
                <Trash2 className="w-4 h-4 text-white/40 hover:text-red-400" />
              </button>
            )}
            <button 
              onClick={() => setActiveTab('activity')}
              className={cn("flex items-center space-x-2 pb-1 border-b-2 transition-colors", activeTab === 'activity' ? "border-[#7C3AED] text-white" : "border-transparent text-white/40 hover:text-white/70")}
            >
              <Activity className="w-4 h-4" />
              <span>Activity</span>
            </button>
            <button 
              onClick={() => setActiveTab('files')}
              className={cn("flex items-center space-x-2 pb-1 border-b-2 transition-colors", activeTab === 'files' ? "border-[#7C3AED] text-white" : "border-transparent text-white/40 hover:text-white/70")}
            >
              <FileCode className="w-4 h-4" />
              <span>Files</span>
            </button>
            {implementationPath && <button
              onClick={() => setActiveTab('implementation')}
              className={cn("flex items-center gap-2 pb-1 border-b-2 transition-colors", activeTab === 'implementation' ? "border-[#7C3AED] text-white" : "border-transparent text-white/40 hover:text-white/70")}
            >
              <FileText className="w-4 h-4" />
              <span className="max-w-[140px] truncate">Implementation</span>
              <X size={12} onClick={(event) => { event.stopPropagation(); setImplementationPath(null); setActiveTab('tasks'); }} />
            </button>}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative">
          <AnimatePresence mode="wait">
            
            {/* TASKS TAB */}
            {activeTab === 'tasks' && (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TodoListPanel 
                  tasks={tasks} 
                  subagents={subagents}
                  onTaskClick={onTaskClick}
                  className="space-y-2"
                />
              </motion.div>
            )}

            {/* ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <motion.div
                key="activity"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col space-y-4"
              >
                {agentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-white/40 mt-10">
                    <Activity className="w-8 h-8 mb-2 opacity-50" />
                    <p>No agent activity yet</p>
                  </div>
                ) : (
                  <div className="relative border-l border-white/10 ml-3 pl-5 space-y-6">
                    {agentActivity.slice().reverse().map((act) => (
                      <div key={act.id} className="relative group">
                        <div className="absolute -left-[25px] top-1 bg-[#141419] p-1 rounded-full border border-white/10">
                          {getActivityIcon(act.type, act.toolName)}
                        </div>
                        <div className="flex flex-col bg-[#141419] border border-white/5 p-3 rounded-lg hover:border-white/10 transition-colors">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white/40 text-xs">{formatTime(act.timestamp)}</span>
                            <div className="flex items-center space-x-2">
                              {act.status === 'running' && (
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                              )}
                              {act.status === 'completed' && <span className="h-2 w-2 rounded-full bg-green-500"></span>}
                              {act.status === 'error' && <span className="h-2 w-2 rounded-full bg-red-500"></span>}
                              {act.durationMs && <span className="text-xs text-white/30">{act.durationMs}ms</span>}
                            </div>
                          </div>
                          <div className="text-white/80 text-sm">{act.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* FILES TAB */}
            {activeTab === 'files' && (
              <motion.div
                key="files"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col space-y-2"
              >
                {filesChanged.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-white/40 mt-10">
                    <FileCode className="w-8 h-8 mb-2 opacity-50" />
                    <p>No files changed</p>
                  </div>
                ) : (
                  filesChanged.map((file, i) => {
                    const basename = file.path.split('/').pop() || file.path.split('\\').pop() || file.path;
                    const color = file.type === 'modified' ? 'text-blue-400 bg-blue-400/10' : file.type === 'created' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10';
                    const isExpanded = expandedFiles.has(file.path);
                    return (
                      <div key={i} className="flex flex-col space-y-2">
                        <div className="group flex items-center justify-between p-2 rounded-lg bg-[#141419] border border-white/5 hover:border-white/10 transition-colors cursor-pointer" title={file.path} onClick={() => toggleFile(file.path)}>
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <FileIcon filename={basename} size={16} />
                            <span className="truncate text-white/80 hover:text-white transition-colors">
                              {basename}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                          <button 
                              className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-all p-1"
                              onClick={(e) => { e.stopPropagation(); onClearFile && onClearFile(file.path); }}
                              title="Clear from sidebar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && file.content && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="max-h-[400px] overflow-y-auto rounded-xl border border-white/5 bg-black/50">
                                <CodeBlock 
                                  language={file.path.split('.').pop() || 'text'} 
                                  code={file.content} 
                                  filename={basename}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </motion.div>
            )}

            {activeTab === 'implementation' && implementationPath && (
              <motion.div key="implementation" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>

                <div className="font-sans text-[13px] leading-6 text-zinc-300">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      h1: ({ children }) => <h1 className="text-xl leading-7 font-semibold text-white mb-4">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-semibold text-white mt-7 mb-3 pb-2 border-b border-white/10">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold text-violet-200 mt-5 mb-2">{children}</h3>,
                      p: ({ children }) => <p className="mb-3 text-zinc-300">{children}</p>,
                      ul: ({ children }) => <ul className="mb-4 pl-5 list-disc space-y-1 marker:text-violet-400">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-4 pl-5 list-decimal space-y-1 marker:text-violet-400">{children}</ol>,
                      code: ({ children }) => <code className="font-mono text-[12px] text-blue-200 bg-blue-500/10 border border-blue-500/10 rounded px-1.5 py-0.5">{children}</code>,
                      table: ({ children }) => <div className="my-4 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[420px] border-collapse text-left text-xs">{children}</table></div>,
                      thead: ({ children }) => <thead className="bg-white/5 text-white">{children}</thead>,
                      th: ({ children }) => <th className="px-3 py-2 font-medium border-b border-white/10">{children}</th>,
                      td: ({ children }) => <td className="px-3 py-2 align-top border-b border-white/5 text-zinc-300">{children}</td>,
                      blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-violet-500 pl-3 text-zinc-400">{children}</blockquote>,
                    }}
                  >{implementationContent}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Fixed Footer */}
        <AnimatePresence>
          {activeTab === 'implementation' && implementationPath && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 10 }} 
              className="w-full border-t border-white/10 bg-[#0f0f13] px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.25)] shrink-0 z-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">Change to Agentic Mode to start implementation</div>
                  <div className="text-[10px] text-white/40 mt-1">Switching modes starts this plan once.</div>
                </div>
                <div aria-hidden="true" className="relative w-10 h-5 rounded-full bg-violet-500/30 border border-violet-400/30 pointer-events-none">
                  <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-violet-400 transition-transform duration-300", agentModeActive ? "translate-x-[21px]" : "translate-x-0.5")} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

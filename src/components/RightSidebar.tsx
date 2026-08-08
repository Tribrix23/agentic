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
  onTaskClick?: (task: Task) => void;
  conversationId?: string;
  onClearTasks?: () => void;
}

type TabType = 'activity' | 'files' | 'context' | 'tasks';

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
  isOpen, toggle, agentActivity = [], filesChanged = [], tokenBudget, onRevertFile, onOpenFile, onClearFile, tasks = [], onTaskClick, conversationId, onClearTasks
}: RightSidebarProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

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
            <button 
              onClick={() => setActiveTab('context')}
              className={cn("flex items-center space-x-2 pb-1 border-b-2 transition-colors", activeTab === 'context' ? "border-[#7C3AED] text-white" : "border-transparent text-white/40 hover:text-white/70")}
            >
              <Layers className="w-4 h-4" />
              <span>Context</span>
            </button>
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

            {/* CONTEXT TAB */}
            {activeTab === 'context' && (
              <motion.div
                key="context"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col space-y-6"
              >
                {!tokenBudget ? (
                  <div className="flex flex-col items-center justify-center text-white/40 mt-10">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p>No context data available</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-[#141419] p-4 rounded-lg border border-white/5">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-white/70">Context Utilization</span>
                        <span className={cn("text-lg", tokenBudget.utilizationPercent > 80 ? 'text-red-400' : tokenBudget.utilizationPercent > 50 ? 'text-yellow-400' : 'text-green-400')}>
                          {tokenBudget.utilizationPercent.toFixed(1)}%
                        </span>
                      </div>
                      
                      {/* Stacked Bar */}
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex mt-4">
                        <div style={{width: `${(tokenBudget.systemPrompt/tokenBudget.total)*100}%`}} className="bg-purple-500 h-full" title="System Prompt" />
                        <div style={{width: `${(tokenBudget.tools/tokenBudget.total)*100}%`}} className="bg-blue-500 h-full" title="Tools" />
                        <div style={{width: `${(tokenBudget.projectContext/tokenBudget.total)*100}%`}} className="bg-cyan-500 h-full" title="Project Context" />
                        <div style={{width: `${(tokenBudget.conversationHistory/tokenBudget.total)*100}%`}} className="bg-green-500 h-full" title="History" />
                        <div style={{width: `${(tokenBudget.responseReserved/tokenBudget.total)*100}%`}} className="bg-orange-500 h-full" title="Response Reserved" />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-white/40">
                        <span>{formatTokenCount(tokenBudget.total - tokenBudget.available)}</span>
                        <span>{formatTokenCount(tokenBudget.total)} max</span>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center justify-between p-2 rounded bg-purple-500/10 text-purple-200">
                        <span>System Prompt</span>
                        <span>{formatTokenCount(tokenBudget.systemPrompt)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-blue-500/10 text-blue-200">
                        <span>Tools</span>
                        <span>{formatTokenCount(tokenBudget.tools)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-cyan-500/10 text-cyan-200">
                        <span>Project Context</span>
                        <span>{formatTokenCount(tokenBudget.projectContext)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-green-500/10 text-green-200">
                        <span>History</span>
                        <span>{formatTokenCount(tokenBudget.conversationHistory)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-orange-500/10 text-orange-200">
                        <span>Reserved Response</span>
                        <span>{formatTokenCount(tokenBudget.responseReserved)}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded bg-white/5 text-white/60">
                        <span>Available</span>
                        <span>{formatTokenCount(tokenBudget.available)}</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

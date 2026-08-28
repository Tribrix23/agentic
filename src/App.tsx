import React from 'react';
import { Minus, Square, X, Atom } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './index.css';

import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { RightSidebar, AgentActivity, FileChange } from './components/RightSidebar';
import { MainContent } from './components/MainContent';
import { SettingsModal } from './components/SettingsModal';
import { IdeContainer } from './components/IdeContainer';
import { ModelAnnouncementCard } from './components/ModelAnnouncementCard';
import { getDurableTasksForConversation, clearAllTasks, clearConversationTasks } from './lib/taskStore';
import { Task } from './lib/taskStore';
import type { SubagentHandle } from './lib/agent/subagentTypes';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Live Animated Background Orbs
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

// Color sequence for AI running state (default colors first, then random colors)
const aiRunningColors = [
  'bg-purple-600/10',  // Default orb 1
  'bg-blue-600/10',    // Default orb 2
  'bg-green-400/15',
  'bg-yellow-400/15',
  'bg-green-500/15',
  'bg-purple-500/15',
  'bg-cyan-400/15',
  'bg-blue-500/15',
  'bg-pink-400/15',
  'bg-rose-400/15',
  'bg-orange-400/15',
  'bg-amber-400/15',
  'bg-lime-400/15',
  'bg-emerald-400/15',
  'bg-teal-400/15',
  'bg-sky-400/15',
  'bg-indigo-400/15',
  'bg-violet-400/15',
  'bg-fuchsia-400/15',
  'bg-red-400/15',
  'bg-slate-400/15',
  'bg-zinc-400/15',
  'bg-neutral-400/15',
  'bg-stone-400/15',
];

// Vibrant Premium Button Variants
const buttonVariants: Variants = {
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

// Staggered Container for Entrance Animation
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.4,
      delayChildren: 0.3,
    }
  }
};

// Individual item animation within the stagger
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1] // Custom spring-like cubic bezier
    }
  }
};

const App = () => {
  // Initialize state from localStorage so the session persists across app restarts
  const [user, setUser] = React.useState<{name: string, avatar: string, token?: string} | null>(() => {
    const savedSession = localStorage.getItem('quantix_session');
    if (savedSession) {
      try {
        return JSON.parse(savedSession);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [leftSidebarOpen, setLeftSidebarOpen] = React.useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [showFullIde, setShowFullIde] = React.useState(false);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [agentActivity, setAgentActivity] = React.useState<AgentActivity[]>([]);
  const [subagents, setSubagents] = React.useState<SubagentHandle[]>([]);
  const [filesChanged, setFilesChanged] = React.useState<FileChange[]>([]);
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null);
  const currentConversationIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);
  const [isAiRunning, setIsAiRunning] = React.useState(false);
  const [orb1ColorIndex, setOrb1ColorIndex] = React.useState(0);
  const [orb2ColorIndex, setOrb2ColorIndex] = React.useState(1);
  const [accountCreated, setAccountCreated] = React.useState(false);

  // Removed aggressive clearAllTasks() on mount to prevent wiping tasks on page refresh.
  // Tasks are now properly scoped to conversations, so this is no longer needed.

  // Color cycling for AI running state
  React.useEffect(() => {
    if (isAiRunning) {
      const updateColors = () => {
        // Pick random colors (skip the first two default colors)
        const randomIndex1 = Math.floor(Math.random() * (aiRunningColors.length - 2)) + 2;
        const randomIndex2 = Math.floor(Math.random() * (aiRunningColors.length - 2)) + 2;
        setOrb1ColorIndex(randomIndex1);
        setOrb2ColorIndex(randomIndex2);
      };

      // Set initial random colors immediately
      updateColors();
      
      const interval = setInterval(updateColors, 4000); // 4 seconds per color transition

      return () => clearInterval(interval);
    } else {
      // Reset to default colors when AI stops
      setOrb1ColorIndex(0);
      setOrb2ColorIndex(1);
    }
  }, [isAiRunning]);

  // Get current colors based on AI state
  const getOrbColors = () => {
    if (isAiRunning) {
      return [aiRunningColors[orb1ColorIndex], aiRunningColors[orb2ColorIndex]];
    }
    // Return default colors (first two in the array)
    return [aiRunningColors[0], aiRunningColors[1]];
  };

  const [orb1Color, orb2Color] = getOrbColors();

  // When conversation changes, reload tasks scoped to that conversation
  React.useEffect(() => {
    if (currentConversationId) {
      setTasks(getDurableTasksForConversation(currentConversationId));
    } else {
      setTasks([]);
    }
  }, [currentConversationId]);

  // Listen for task changes and reload
  React.useEffect(() => {
    const handleTaskChange = () => {
      if (currentConversationIdRef.current) {
        setTasks(getDurableTasksForConversation(currentConversationIdRef.current));
      } else {
        // No conversation scoping yet (first message) — show all agent-created tasks
        setTasks([]);
      }
    };

    // Also listen for conversation switches from the sidebar
    const handleConversationLoad = (e: any) => {
      setCurrentConversationId(e.detail?.id || null);
      setIsAiRunning(false);
      setAgentActivity([]);  // Clear activity log on conversation switch
    };


    const handleNewConversation = () => {
      setCurrentConversationId(null);
      setIsAiRunning(false);
      setTasks([]);
      setAgentActivity([]);
      setFilesChanged([]);
    };

    const handleOpenRightSidebar = () => setRightSidebarOpen(true);
    const handleOpenImplementationPlan = () => setRightSidebarOpen(true);
    window.addEventListener('open-right-sidebar', handleOpenRightSidebar);
    window.addEventListener('open-implementation-plan', handleOpenImplementationPlan);

    window.addEventListener('task-updated', handleTaskChange);
    window.addEventListener('task-deleted', handleTaskChange);
    window.addEventListener('tasks-cleared', handleTaskChange);
    window.addEventListener('load-conversation', handleConversationLoad);
    window.addEventListener('new-conversation', handleNewConversation);
    // MainContent sets a new conversation id on first message
    const handleConversationStarted = (e: any) => {
      setCurrentConversationId(e.detail?.id || null);
    };
    window.addEventListener('conversation-started', handleConversationStarted);
    const handleProjectRestore = (e: CustomEvent) => {
      if (!e.detail?.conversationId || e.detail.conversationId === currentConversationIdRef.current) setFilesChanged([]);
    };
    window.addEventListener('project-files-restored', handleProjectRestore as any);

    return () => {
      window.removeEventListener('open-right-sidebar', handleOpenRightSidebar);
      window.removeEventListener('open-implementation-plan', handleOpenImplementationPlan);
      window.removeEventListener('task-updated', handleTaskChange);
      window.removeEventListener('task-deleted', handleTaskChange);
      window.removeEventListener('tasks-cleared', handleTaskChange);
      window.removeEventListener('load-conversation', handleConversationLoad);
      window.removeEventListener('new-conversation', handleNewConversation);
      window.removeEventListener('conversation-started', handleConversationStarted);
      window.removeEventListener('project-files-restored', handleProjectRestore as any);
    };
  }, []);

  // Listen for agent activity events
  React.useEffect(() => {
    const maxActivity = 200;
    const belongsToConversation = (detail: any) => !detail?.conversationId || detail.conversationId === currentConversationIdRef.current;
    const bounded = (items: AgentActivity[]) => items.slice(-maxActivity);
    const handleAgentThinking = (e: CustomEvent) => {
      if (!belongsToConversation(e.detail)) return;
      setAgentActivity(prev => bounded([...prev.filter(item => !(item.type === 'thinking' && item.status === 'running' && item.runId === e.detail?.runId)), {
        id: `thinking:${e.detail?.runId || 'current'}`,
        timestamp: Date.now(),
        type: 'thinking',
        description: 'Agent is thinking...',
        status: 'running',
        runId: e.detail?.runId,
        conversationId: e.detail?.conversationId,
        turnId: e.detail?.turnId,
      }]));
    };

    const handleRunningState = (e: CustomEvent) => {
      if (!e.detail?.activeConversationId || e.detail.activeConversationId === currentConversationIdRef.current) {
        setIsAiRunning(Boolean(e.detail?.isRunning));
      }
    };

    const handleAgentToolExecuting = (e: CustomEvent) => {
      const toolCall = e.detail;
      if (!belongsToConversation(toolCall) || !toolCall?.id) return;
      setAgentActivity(prev => bounded([...prev.filter(item => item.callId !== toolCall.id), {
        id: `tool:${toolCall.runId || 'run'}:${toolCall.id}`,
        callId: toolCall.id,
        timestamp: Date.now(),
        type: 'tool_call',
        toolName: toolCall.name,
        description: `${toolCall.agentKind === 'subagent' ? `${toolCall.agentRole || 'Sub-agent'}: ` : ''}Running ${toolCall.name}`,
        status: 'running',
        actorKind: toolCall.agentKind,
        actorRole: toolCall.agentRole,
        runId: toolCall.runId,
        conversationId: toolCall.conversationId,
        turnId: toolCall.turnId,
      }]));
    };

    const handleAgentToolResult = (e: CustomEvent) => {
      const { toolCall, result } = e.detail;
      if (!belongsToConversation(e.detail) || !toolCall?.id) return;
      
      // Update filesChanged list if it's a file operation
      if (result.success && ['writeFile', 'createFile', 'write_to_file', 'editFile', 'replace_file_content', 'multi_replace_file_content'].includes(toolCall.name)) {
        const filePath = toolCall.arguments?.path || toolCall.arguments?.TargetFile;
        const content = toolCall.arguments?.content || toolCall.arguments?.CodeContent || toolCall.arguments?.ReplacementContent || '';
        if (filePath) {
          setFilesChanged(prev => {
            const existing = prev.find(f => f.path === filePath);
            if (existing) {
              return prev.map(f => f.path === filePath ? { ...f, type: 'modified', content } : f);
            }
            return [...prev, { path: filePath, type: 'created', content }];
          });
        }
      }

      setAgentActivity(prev => {
        const updated = prev.map(act => {
          if (act.callId === toolCall.id) {
            return {
              ...act,
              status: result.success ? 'completed' as const : 'error' as const,
              durationMs: toolCall.durationMs,
            };
          }
          return act;
        });
        return updated;
      });
    };

    const handleCodingProgress = (e: CustomEvent) => {
      if (!belongsToConversation(e.detail)) return;
      const { callId, fileName, filePath, added, removed } = e.detail;
      setAgentActivity(prev => {
        const updated = prev.map(act => {
          if (act.callId === callId) {
            return {
              ...act,
              description: `${act.toolName || 'File operation'} ${fileName} +${added} -${removed}`,
              fileName,
              filePath,
              progress: { added, removed },
            };
          }
          return act;
        });
        return updated;
      });
    };

    window.addEventListener('agent:thinking', handleAgentThinking as any);
    window.addEventListener('agent-running-state', handleRunningState as any);
    window.addEventListener('agent:tool-executing', handleAgentToolExecuting as any);
    window.addEventListener('agent:tool-result', handleAgentToolResult as any);
    window.addEventListener('agent:coding-progress', handleCodingProgress as any);
    
    const handleOpenSidebarFile = (e: CustomEvent) => {
      setRightSidebarOpen(true);
      if (e.detail?.path) {
        setFilesChanged(prev => {
          if (!prev.some(f => f.path === e.detail.path)) {
            return [...prev, { path: e.detail.path, type: e.detail.type || 'modified', content: e.detail.content }];
          }
          return prev;
        });
      }
    };
    window.addEventListener('open-sidebar-file', handleOpenSidebarFile as any);

    return () => {
      window.removeEventListener('agent:thinking', handleAgentThinking as any);
      window.removeEventListener('agent-running-state', handleRunningState as any);
      window.removeEventListener('agent:tool-executing', handleAgentToolExecuting as any);
      window.removeEventListener('agent:tool-result', handleAgentToolResult as any);
      window.removeEventListener('agent:coding-progress', handleCodingProgress as any);
      window.removeEventListener('open-sidebar-file', handleOpenSidebarFile as any);
    };
  }, []);

  React.useEffect(() => {
    // Listen for deep link authentication success
    if ((window as any).electron?.onAuthSuccess) {
      (window as any).electron.onAuthSuccess((data: any) => {
        if (data && data.name) {
          const newUser = {
            name: data.name,
            avatar: data.avatar || "https://i.pravatar.cc/150?img=11",
            token: data.token
          };
          setUser(newUser);
          // Persist to local storage
          localStorage.setItem('quantix_session', JSON.stringify(newUser));
          
          // Create account after successful login (only once)
          if (data.token && !accountCreated) {
            createAccount(data.token);
            setAccountCreated(true);
          }
        }
      });
    }
  }, []);

  const createAccount = async (userId: string) => {
    try {
      const response = await fetch('https://api.devctr.com/api/create-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });
      return response;
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  const handleLogin = () => {
    if (user) {
      (window as any).electron?.openExternal('https://quantix.devctr.com/?source=desktop_app');
    } else {
      (window as any).electron?.openExternal('https://quantix.devctr.com/?source=desktop_app');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('quantix_session');
    setSettingsOpen(false);
  };

  // If user is logged in, show the full IDE three-pane dashboard or full IDE container
  if (user) {
    if (showFullIde) {
      return <IdeContainer user={user} onBack={() => setShowFullIde(false)} />;
    }

    return (
      <div className="w-full h-screen flex text-white overflow-hidden bg-[#08080c] relative">
        {/* Live Animated Background Orbs (Behind everything) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <motion.div
            variants={orb1Variants}
            animate="animate"
            className={`absolute top-[0%] left-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px] transition-colors duration-1000 ease-in-out ${orb1Color}`}
          />
          <motion.div
            variants={orb2Variants}
            animate="animate"
            className={`absolute bottom-[0%] right-[10%] w-[50vw] h-[50vw] rounded-full blur-[120px] transition-colors duration-1000 ease-in-out ${orb2Color}`}
          />
        </div>

        <TitleBar userName={user.name} userAvatar={user.avatar} />
        <Sidebar isOpen={leftSidebarOpen} onOpenSettings={() => setSettingsOpen(true)} />
        <ModelAnnouncementCard />
        <MainContent 
          user={user} 
          leftOpen={leftSidebarOpen}
          rightOpen={rightSidebarOpen}
          toggleLeftSidebar={() => setLeftSidebarOpen(!leftSidebarOpen)}
          toggleRightSidebar={() => setRightSidebarOpen(!rightSidebarOpen)}
          onOpenIde={() => setShowFullIde(true)}
        />
        <RightSidebar 
          isOpen={rightSidebarOpen} 
          toggle={() => setRightSidebarOpen(false)}
        tasks={tasks}
        subagents={subagents}
          onTaskClick={(task) => console.log('Task clicked:', task)}
          agentActivity={agentActivity}
          filesChanged={filesChanged}
          onClearFile={(path: string) => setFilesChanged(prev => prev.filter(f => f.path !== path))}
          conversationId={currentConversationId}
          onClearTasks={() => {
            if (currentConversationId) {
              clearConversationTasks(currentConversationId);
            } else {
              clearAllTasks();
            }
          }}
        />
        
        {/* Settings Modal */}
        {settingsOpen && (
          <SettingsModal 
            user={user} 
            onClose={() => setSettingsOpen(false)} 
            onLogout={handleLogout} 
          />
        )}
      </div>
    );
  }

  // Otherwise, show the Login Screen
  return (
    <div className="w-full h-screen flex flex-col text-white selection:bg-purple-500/30 overflow-hidden relative bg-[#08080c]">
      <TitleBar />

      {/* Live Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div
          variants={orb1Variants}
          animate="animate"
          className={`absolute top-[0%] left-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px] transition-colors duration-1000 ease-in-out ${orb1Color}`}
        />
        <motion.div
          variants={orb2Variants}
          animate="animate"
          className={`absolute bottom-[0%] right-[10%] w-[50vw] h-[50vw] rounded-full blur-[120px] transition-colors duration-1000 ease-in-out ${orb2Color}`}
        />
      </div>

      <main className="flex-1 flex flex-col justify-center items-center text-center pb-20 relative z-10">
        <motion.div
          key="login"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center"
        >
          <motion.div variants={itemVariants} className="mb-10">
            <img
              src="./icon.png"
              alt="QUANTIX Logo"
              className="w-[120px] h-[120px] object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.8)]"
            />
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-[48px] font-bold mb-4 tracking-[1.5px] text-white"
          >
            QUANTIX CODE
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-[18px] text-[#94a3b8] font-normal mb-16 tracking-wide max-w-[500px]"
          >
            Code faster and build better software with AI.
          </motion.p>

          {/* Stunning Solid Gradient Button */}
          <motion.div variants={itemVariants}>
            <motion.button
              variants={buttonVariants}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
              onClick={handleLogin}
              className={cn(
                "relative overflow-hidden region-no-drag group",
                "flex items-center justify-center",
                "w-[280px] h-[40px] rounded-md",
                "transition-all duration-300 ease-out cursor-pointer"
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
                  Log In
                </span>
              </div>
            </motion.button>
          </motion.div>

        </motion.div>
      </main>
    </div>
  );
};

export default App;

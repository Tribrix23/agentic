import React from 'react';
import { Minus, Square, X, Atom } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './index.css';

import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { MainContent } from './components/MainContent';
import { SettingsModal } from './components/SettingsModal';
import { IdeContainer } from './components/IdeContainer';

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
        }
      });
    }
  }, []);

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
      return <IdeContainer onBack={() => setShowFullIde(false)} />;
    }

    return (
      <div className="w-full h-screen flex text-white overflow-hidden bg-[#08080c] relative">
        {/* Live Animated Background Orbs (Behind everything) */}
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

        <TitleBar />
        <Sidebar isOpen={leftSidebarOpen} onOpenSettings={() => setSettingsOpen(true)} />
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
          className="absolute top-[0%] left-[10%] w-[60vw] h-[60vw] rounded-full bg-purple-600/10 blur-[120px]"
        />
        <motion.div
          variants={orb2Variants}
          animate="animate"
          className="absolute bottom-[0%] right-[10%] w-[50vw] h-[50vw] rounded-full bg-blue-600/10 blur-[120px]"
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
              src="/icon.png"
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

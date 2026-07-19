import React from 'react';
import { Minus, Square, X, Atom } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './index.css';

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
  const handleMinimize = () => {
    (window as any).electron?.windowControls?.minimize();
  };

  const handleMaximize = () => {
    (window as any).electron?.windowControls?.maximize();
  };

  const handleClose = () => {
    (window as any).electron?.windowControls?.close();
  };

  return (
    <div className="w-full h-screen flex flex-col text-white selection:bg-purple-500/30 overflow-hidden relative bg-[#08080c]">
      
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

      <div className="shrink-0 w-full h-8 flex justify-end items-center z-[100] region-drag">
        <div className="flex h-full region-no-drag">
          <button 
            className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-white/10 hover:text-white transition-colors duration-100" 
            onClick={handleMinimize}
          >
            <Minus size={14} />
          </button>
          <button 
            className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-white/10 hover:text-white transition-colors duration-100" 
            onClick={handleMaximize}
          >
            <Square size={12} />
          </button>
          <button 
            className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-red-500 hover:text-white transition-colors duration-100" 
            onClick={handleClose}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <main className="flex-1 flex flex-col justify-center items-center text-center pb-20 relative z-10">
        <motion.div
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
              className={cn(
                "relative overflow-hidden region-no-drag group",
                "flex items-center justify-center",
                "w-[280px] h-[40px] rounded-md",
                "transition-all duration-300 ease-out"
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
              
              <div className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none gap-4">
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

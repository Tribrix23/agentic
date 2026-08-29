import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, Search, Package } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import { cn } from '../App';

interface AddonsViewProps {
  onClose: () => void;
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      type: "spring" as const,
      stiffness: 350,
      damping: 25,
    }
  }),
  exit: {
    opacity: 0,
    scale: 0.9,
    y: -20,
    transition: {
      duration: 0.2,
      ease: "easeOut" as const
    }
  }
};

export const AddonsView: React.FC<AddonsViewProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: containerRef });
  
  const [currentTab, setCurrentTab] = useState<'store' | 'downloads'>('store');
  
  // Parallax for hero section
  const heroY = useTransform(scrollY, [0, 300], [0, 100]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      className="absolute top-[32px] left-0 right-0 bottom-0 bg-[#08080c] z-[60] flex flex-col text-white font-sans overflow-hidden"
    >
      {/* Header - Fixed at Top */}
      <div className="flex items-center px-6 py-4 border-b border-white/5 shrink-0 bg-[#08080c]/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-6 w-1/4">
          <Tooltip content={currentTab === 'downloads' ? "Back to Store" : "Return to App"} position="right">
            <button 
              onClick={() => currentTab === 'downloads' ? setCurrentTab('store') : onClose()}
              className="w-8 h-8 hover:bg-white/10 rounded-md transition-colors flex items-center justify-center text-[#94a3b8] hover:text-white"
            >
              <ArrowLeft size={18} />
            </button>
          </Tooltip>
          <span className="text-lg font-semibold tracking-wide text-white/90">
            {currentTab === 'downloads' ? 'Downloads' : 'Add-ons'}
          </span>
        </div>
        
        <div className="flex-1 flex justify-center w-1/2">
          {currentTab === 'store' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-3xl"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input 
                type="text" 
                placeholder="Search apps, add-ons, themes..."
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-colors shadow-inner"
              />
            </motion.div>
          )}
        </div>

        <div className="flex items-center justify-end w-1/4">
          {currentTab === 'store' && (
            <Tooltip content="View Downloads" position="bottom">
              <button 
                onClick={() => setCurrentTab('downloads')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors text-sm font-medium text-[#94a3b8] hover:text-white"
              >
                <Download size={16} />
                <span>Downloads</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div 
        ref={containerRef}
        className={cn("flex-1 relative z-10 w-full flex flex-col", currentTab === 'store' ? "overflow-y-auto custom-scrollbar" : "overflow-hidden")}
      >
        <AnimatePresence mode="wait">
          {currentTab === 'store' ? (
            <motion.div 
              key="store"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-8 space-y-10 max-w-7xl mx-auto w-full"
            >
              {/* Hero Section with Parallax */}
              <div className="relative w-full h-[360px] rounded-2xl overflow-hidden border border-white/5 flex items-end p-10 bg-[#0f0f13]">
                {/* Parallax Background */}
                <motion.div 
                  style={{ y: heroY, opacity: heroOpacity }}
                  className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-blue-600/20 z-0" 
                />
                
                <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-[#08080c]/40 to-transparent z-0" />
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 25 }}
                  className="relative z-10 w-full max-w-2xl space-y-5"
                >
                  <div className="w-40 h-6 bg-white/10 rounded-md animate-pulse" />
                  <div className="w-3/4 h-14 bg-white/10 rounded-md animate-pulse" />
                  <div className="w-1/2 h-4 bg-white/10 rounded-md animate-pulse" />
                  <div className="pt-2">
                    <div className="w-28 h-10 bg-purple-500/40 rounded-md animate-pulse" />
                  </div>
                </motion.div>
              </div>

              {/* Trending Section */}
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-wide">Trending Add-ons</h2>
                  <button className="text-sm text-[#94a3b8] hover:text-white transition-colors">See all</button>
                </div>
                
                <motion.div 
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                >
                  {[...Array(8)].map((_, i) => (
                    <motion.div 
                      key={i} 
                      custom={i}
                      variants={cardVariants}
                      className="bg-[#0f0f13] border border-white/5 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/5 transition-colors cursor-pointer group shadow-sm hover:shadow-xl"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 bg-white/10 rounded-xl animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2.5 py-1">
                          <div className="w-full h-4 bg-white/10 rounded animate-pulse" />
                          <div className="w-2/3 h-3 bg-white/10 rounded animate-pulse" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-3">
                        <div className="w-12 h-4 bg-white/10 rounded animate-pulse" />
                        <div className="w-16 h-8 bg-white/10 rounded-md animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
              
              {/* Recommended Themes Section */}
              <div className="space-y-5 pb-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-wide">Recommended Themes</h2>
                  <button className="text-sm text-[#94a3b8] hover:text-white transition-colors">See all</button>
                </div>
                
                <motion.div 
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="grid grid-cols-1 lg:grid-cols-2 gap-5"
                >
                  {[...Array(4)].map((_, i) => (
                    <motion.div 
                      key={i}
                      custom={i + 8} // Stagger after the first 8 items
                      variants={cardVariants}
                      className="bg-[#0f0f13] border border-white/5 rounded-xl p-5 flex items-center gap-5 hover:bg-white/5 transition-colors cursor-pointer group shadow-sm hover:shadow-xl"
                    >
                      <div className="w-32 h-20 bg-white/10 rounded-lg animate-pulse shrink-0" />
                      <div className="flex-1 space-y-2.5">
                        <div className="w-1/2 h-4 bg-white/10 rounded animate-pulse" />
                        <div className="w-3/4 h-3 bg-white/10 rounded animate-pulse" />
                      </div>
                      <div className="w-16 h-8 bg-white/10 rounded-md animate-pulse opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </motion.div>
                  ))}
                </motion.div>
              </div>

            </motion.div>
          ) : (
            <motion.div 
              key="downloads"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col p-8 max-w-5xl mx-auto w-full h-full"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-6 shrink-0">
                <div>
                  <h2 className="text-2xl font-semibold tracking-wide">Downloads</h2>
                  <p className="text-sm text-[#94a3b8] mt-1">Manage your installed add-ons and themes</p>
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition-colors text-white">
                    Pause All
                  </button>
                  <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm transition-colors text-white font-medium shadow-[0_0_15px_rgba(147,51,234,0.3)]">
                    Update All
                  </button>
                </div>
              </div>

              {/* Downloads list - Skeletons */}
              <div 
                className="flex-1 overflow-y-auto custom-scrollbar pt-6 pb-20 space-y-3"
                style={{ maskImage: 'linear-gradient(to bottom, transparent, black 15px, black calc(100% - 30px), transparent)' }}
              >
                {[...Array(12)].map((_, i) => (
                  <motion.div 
                    key={i}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    className="bg-[#0f0f13] border border-white/5 rounded-xl p-4 flex items-center gap-6 hover:bg-white/5 transition-colors"
                  >
                    <div className="w-12 h-12 bg-white/10 rounded-lg animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="w-48 h-4 bg-white/10 rounded animate-pulse" />
                      <div className="w-full max-w-md h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500/50 w-1/3 rounded-full animate-pulse" />
                      </div>
                      <div className="w-32 h-3 bg-white/10 rounded animate-pulse" />
                    </div>
                    <div className="w-8 h-8 bg-white/10 rounded-full animate-pulse shrink-0" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

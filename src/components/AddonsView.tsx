import React, { useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Download, Search, Package } from 'lucide-react';
import { Tooltip } from './ui/Tooltip';
import { cn } from '../App';
import { Addon, fetchAddons } from '../lib/addonsApi';
import { AddonDetails } from './AddonDetails';
import { VerifiedBadge } from './ui/VerifiedBadge';
import { AnimatedInstallButton } from './ui/AnimatedInstallButton';
import { useEffect } from 'react';

const getSkillNameFromLink = (link?: string) => {
  if (!link) return null;
  const match = link.match(/--skill\s+([\w-]+)/);
  return match ? match[1] : null;
};

const getSourceFromLink = (link?: string) => {
  if (!link) return null;
  const match = link.match(/add\s+([^\s]+)/);
  return match ? match[1] : null;
};

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
      duration: 0.4,
      ease: "easeOut" as const
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
  const [selectedAddon, setSelectedAddon] = useState<string | null>(null);
  const [addonsList, setAddonsList] = useState<Addon[]>([]);
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set());
  const [installedSources, setInstalledSources] = useState<Set<string>>(new Set());
  const [installedSourceMap, setInstalledSourceMap] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingStates, setProcessingStates] = useState<Record<string, boolean>>({});

  const refreshInstalledSkills = async () => {
    try {
      const electron = (window as any).electron;
      if (electron) {
        const userDataPath = await electron.getUserDataPath();
        const res = await electron.readFileContent(`${userDataPath}/skills/skills-lock.json`);
        if (typeof res === 'string') {
          const data = JSON.parse(res);
          const sources = new Set<string>();
          const names = new Set<string>();
          const sourceMap: Record<string, string[]> = {};
          if (data && data.skills) {
            for (const key in data.skills) {
              names.add(key);
              const source = data.skills[key].source;
              if (source) {
                sources.add(source);
                if (!sourceMap[source]) sourceMap[source] = [];
                sourceMap[source].push(key);
              }
            }
          }
          setInstalledSkillNames(names);
          setInstalledSources(sources);
          setInstalledSourceMap(sourceMap);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load installed skills', e);
    }
    
    // Fallback to older agentSkills method
    try {
      const { getInstalledSkills } = await import('../lib/agentSkills');
      const skills = await getInstalledSkills('');
      setInstalledSkillNames(new Set(skills.map(s => s.name)));
    } catch (e) {
      console.error('Failed to load installed skills', e);
    }
  };

  const handleInstallAction = async (item: Addon, isInstalled: boolean) => {
    if (!item.download_link) return;
    
    setProcessingStates(prev => ({ ...prev, [item.id]: true }));
    try {
      const electron = (window as any).electron;
      if (electron) {
        const userDataPath = await electron.getUserDataPath();
        const skillsPath = `${userDataPath}/skills`;
        let cmd = item.download_link;
        
        if (isInstalled) {
          const source = getSourceFromLink(item.download_link);
          if (cmd.includes('npx skills') && source && installedSourceMap[source]) {
            const skillNames = installedSourceMap[source];
            const isWin = navigator.userAgent.toLowerCase().includes('win');
            
            for (const skill of skillNames) {
              const folder = `${skillsPath}/.agents/skills/${skill}`;
              const rmCmd = isWin ? `rmdir /s /q "${folder.replace(/\//g, '\\')}"` : `rm -rf "${folder}"`;
              await electron.runCommandCapture(rmCmd, skillsPath);
            }
            
            try {
              const lockPath = `${skillsPath}/skills-lock.json`;
              const res = await electron.readFileContent(lockPath);
              if (typeof res === 'string') {
                const lockData = JSON.parse(res);
                if (lockData && lockData.skills) {
                  for (const skill of skillNames) {
                    delete lockData.skills[skill];
                  }
                  await electron.saveFileContent(lockPath, JSON.stringify(lockData, null, 2));
                }
              }
            } catch (err) {
              console.error('Failed to update skills-lock.json', err);
            }
            
            cmd = '';
          } else {
            cmd = cmd.replace('add', 'remove').replace('install', 'uninstall');
          }
        }
        
        if (cmd) {
          if (!cmd.includes('-y')) {
            cmd += ' -y';
          }
          console.log(`[AddonsView] Executing: ${cmd} in folder: ${skillsPath}`);
          const result = await electron.runCommandCapture(cmd, skillsPath);
          if (!result.success || result.exitCode !== 0) {
            alert(`Failed to install addon:\n${result.stderr || result.error || result.stdout || 'Unknown error'}`);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to process skill:', err);
      alert(`Failed to install: ${err.message}`);
    } finally {
      await refreshInstalledSkills();
      setProcessingStates(prev => ({ ...prev, [item.id]: false }));
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      setIsLoading(true);
      await refreshInstalledSkills();
      const data = await fetchAddons();
      if (mounted) {
        setAddonsList(data);
        setIsLoading(false);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, []);
  
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
          <Tooltip content={selectedAddon ? "Back to Store" : currentTab === 'downloads' ? "Back to Store" : "Return to App"} position="right">
            <button 
              onClick={() => {
                if (selectedAddon) setSelectedAddon(null);
                else if (currentTab === 'downloads') setCurrentTab('store');
                else onClose();
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors text-[#94a3b8] hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
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
        className={cn("flex-1 relative z-10 w-full flex flex-col", currentTab === 'store' && !selectedAddon ? "overflow-y-auto custom-scrollbar" : "overflow-hidden")}
      >
        <AnimatePresence mode="wait">
          {selectedAddon ? (
            <AddonDetails 
              key="details"
              addonId={selectedAddon} 
              onBack={() => {
                setSelectedAddon(null);
                refreshInstalledSkills();
              }} 
              installedSkillNames={installedSkillNames}
              installedSources={installedSources}
              installedSourceMap={installedSourceMap}
              isProcessing={processingStates[selectedAddon] || false}
              onInstallAction={(addon) => {
                const skill = getSkillNameFromLink(addon.download_link);
                const source = getSourceFromLink(addon.download_link);
                const isInstalled = (skill && installedSkillNames.has(skill)) || (source && installedSources.has(source)) ? true : false;
                handleInstallAction(addon, isInstalled);
              }}
            />
          ) : currentTab === 'store' ? (
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

              {/* Addons Grid Section */}
              <div className="space-y-5">
                <motion.div 
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                >
                  {isLoading ? (
                    [...Array(8)].map((_, i) => (
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
                    ))
                  ) : (
                    addonsList.map((item, i) => {
                      const skillName = getSkillNameFromLink(item.download_link);
                      const sourceName = getSourceFromLink(item.download_link);
                      const isInstalled = (skillName && installedSkillNames.has(skillName)) || (sourceName && installedSources.has(sourceName)) ? true : false;
                      const isProcessing = processingStates[item.id] || false;
                      
                      return (
                      <motion.div 
                        key={item.id} 
                        custom={i}
                        variants={cardVariants}
                        className="bg-[#0f0f13] border border-white/5 rounded-xl p-5 flex flex-col gap-4 hover:bg-white/5 transition-colors cursor-pointer group shadow-sm hover:shadow-xl"
                        onClick={() => setSelectedAddon(item.id)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 shrink-0 rounded-xl overflow-hidden bg-black/20 border border-white/10 flex items-center justify-center">
                            {item.first_image ? (
                              <img src={item.first_image} alt="icon" className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-2xl text-white/20">{item.title.charAt(0)}</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-medium text-white truncate">{item.title}</h3>
                              {item.is_verified && <VerifiedBadge className="w-3.5 h-3.5 shrink-0" />}
                            </div>
                            <p className="text-xs text-[#94a3b8] mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-auto pt-3">
                          <span className="text-xs font-medium text-[#94a3b8]">Free</span>
                          <AnimatedInstallButton 
                            className="px-4 py-1.5 text-xs font-semibold bg-[#4f70db] text-white rounded-md hover:bg-[#5f80eb] transition-colors shadow-sm" 
                            isInstalled={isInstalled}
                            isProcessing={isProcessing}
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              if (!item.download_link || isProcessing) return;
                              await handleInstallAction(item, isInstalled);
                            }}
                          />
                        </div>
                      </motion.div>
                    )})
                  )}
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
                {addonsList.filter(item => {
                  const skill = getSkillNameFromLink(item.download_link);
                  const source = getSourceFromLink(item.download_link);
                  return (skill && installedSkillNames.has(skill)) || (source && installedSources.has(source));
                }).map((item, i) => (
                  <motion.div 
                    key={item.id}
                    custom={i}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    className="bg-[#0f0f13] border border-white/5 rounded-xl p-4 flex items-center gap-6 hover:bg-white/5 transition-colors cursor-pointer group"
                    onClick={() => setSelectedAddon(item.id)}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-black/20 border border-white/10">
                      {item.first_image ? (
                        <img src={item.first_image} alt="icon" className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-xl text-white/20">{item.title.charAt(0)}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">{item.title}</h4>
                      <p className="text-xs text-[#94a3b8] mt-1 truncate">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <AnimatedInstallButton 
                        className="px-3 py-1.5 text-xs font-semibold bg-[#4f70db] text-white rounded-md hover:bg-[#5f80eb] transition-colors shadow-sm" 
                        isInstalled={true}
                        isProcessing={processingStates[item.id] || false}
                        onClick={async (e) => { 
                          e.stopPropagation(); 
                          if (!item.download_link || processingStates[item.id]) return;
                          await handleInstallAction(item, true);
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
                
                {addonsList.filter(item => {
                  const skill = getSkillNameFromLink(item.download_link);
                  const source = getSourceFromLink(item.download_link);
                  return (skill && installedSkillNames.has(skill)) || (source && installedSources.has(source));
                }).length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center h-48 text-[#94a3b8]">
                    <Package className="w-12 h-12 mb-4 opacity-20" />
                    <p className="text-sm">No add-ons installed yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck, Share, Globe, ThumbsUp, ThumbsDown, Download } from 'lucide-react';
import { Addon, fetchAddonDetails } from '../lib/addonsApi';
import { VerifiedBadge } from './ui/VerifiedBadge';
import { AnimatedInstallButton } from './ui/AnimatedInstallButton';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg 
    className={className} 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 16 16" 
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="8" fill="white" />
    <path fill="black" fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"></path>
  </svg>
);

interface AddonDetailsProps {
  addonId: string;
  onBack: () => void;
}

export const AddonDetails: React.FC<AddonDetailsProps> = ({ addonId, onBack }) => {
  const [addon, setAddon] = useState<Addon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set());
  const [installedSources, setInstalledSources] = useState<Set<string>>(new Set());
  const [installedSourceMap, setInstalledSourceMap] = useState<Record<string, string[]>>({});

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

  const skillName = getSkillNameFromLink(addon?.download_link);
  const sourceName = getSourceFromLink(addon?.download_link);
  const isInstalled = (skillName && installedSkillNames.has(skillName)) || (sourceName && installedSources.has(sourceName)) ? true : false;

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
    
    // Fallback
    try {
      const { getInstalledSkills } = await import('../lib/agentSkills');
      const skills = await getInstalledSkills('');
      setInstalledSkillNames(new Set(skills.map(s => s.name)));
    } catch (e) {
      console.error('Failed to load installed skills', e);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      await refreshInstalledSkills();
      const data = await fetchAddonDetails(addonId);
      if (mounted && data) {
        setAddon(data);
      }
      if (mounted) setIsLoading(false);
    };
    loadDetails();
    return () => { mounted = false; };
  }, [addonId]);

  const handleOpenLink = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    if ((window as any).electron?.openExternal) {
      (window as any).electron.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/50">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!addon) {
    return (
      <div className="flex items-center justify-center w-full h-full text-white/50">
        Failed to load addon details.
      </div>
    );
  }

  const screenshots = [addon.first_image, addon.last_image].filter(Boolean);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col w-full h-full bg-[#08080c] overflow-y-auto custom-scrollbar"
    >
      <div className="max-w-6xl mx-auto w-full p-8 pb-20">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-12 relative">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-48 h-48 rounded-2xl overflow-hidden bg-[#0f0f13] border border-white/10 shrink-0 shadow-2xl flex items-center justify-center"
          >
            {addon.first_image ? (
              <img src={addon.first_image} alt={addon.title} className="w-full h-full object-cover" />
            ) : (
              <div className="text-4xl text-white/20">{addon.title.charAt(0)}</div>
            )}
          </motion.div>

          <div className="flex-1 flex flex-col justify-center">
            <motion.h1 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-bold text-white mb-3 flex items-center gap-3"
            >
              {addon.title}
              {addon.is_verified && <VerifiedBadge className="w-8 h-8 shrink-0" />}
            </motion.h1>
            
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-8 flex items-center gap-2 text-[#4f70db] font-medium"
            >
              <span>{addon.author}</span>
            </motion.div>

            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-4"
            >
              <AnimatedInstallButton 
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!addon.download_link || isProcessing) return;
                  
                  setIsProcessing(true);
                  try {
                    const electron = (window as any).electron;
                    if (electron) {
                      const userDataPath = await electron.getUserDataPath();
                      const skillsPath = `${userDataPath}/skills`;
                      let cmd = addon.download_link;
                      
                      if (isInstalled) {
                        const source = getSourceFromLink(addon.download_link);
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
                        console.log(`[AddonDetails] Executing: ${cmd} in folder: ${skillsPath}`);
                        const result = await electron.runCommandCapture(cmd, skillsPath);
                        console.log(`[AddonDetails] Result:`, result);
                      }
                    }
                  } catch (err) {
                    console.error('Failed to process skill:', err);
                  } finally {
                    await refreshInstalledSkills();
                    setIsProcessing(false);
                  }
                }}
                isInstalled={isInstalled}
                isProcessing={isProcessing}
                className="relative overflow-hidden px-8 py-3 rounded-md bg-[#4f70db] hover:bg-[#5f80eb] text-white font-medium transition-colors min-w-[180px] flex items-center justify-center gap-2 shadow-sm shadow-[#4f70db]/20"
              >
                <Download className="w-4 h-4" />
                Install
                {/* Shimmer Effect */}
                <motion.div 
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear", repeatDelay: 1 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"
                />
              </AnimatedInstallButton>
              
              <button className="p-3 rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5 group" title="Like">
                <ThumbsUp className="w-5 h-5 text-[#94a3b8] group-hover:text-green-400 transition-colors" />
              </button>

              <button className="p-3 rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5 group" title="Dislike">
                <ThumbsDown className="w-5 h-5 text-[#94a3b8] group-hover:text-red-400 transition-colors" />
              </button>

              <button className="p-3 rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5 group" title="Share">
                <Share className="w-5 h-5 text-[#94a3b8] group-hover:text-white transition-colors" />
              </button>
            </motion.div>
          </div>
        </div>

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            
            {/* Screenshots */}
            {screenshots.length > 0 && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <h2 className="text-xl font-semibold mb-6">Screenshots</h2>
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                  {screenshots.map((src, i) => (
                    <div key={i} className="w-[400px] h-[250px] shrink-0 rounded-xl overflow-hidden bg-[#0f0f13] border border-white/5 shadow-sm">
                      <img src={src} alt="Screenshot" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Description */}
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <h2 className="text-xl font-semibold mb-6">Description</h2>
              <div className="text-[#94a3b8] leading-relaxed space-y-4">
                {addon.description.split('\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </motion.section>

          </div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9 }}
            className="space-y-6"
          >
            <div className="p-6 rounded-xl bg-[#0f0f13] border border-white/5 shadow-sm">
              <h3 className="font-semibold mb-4 text-white">Additional Information</h3>
              
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-[#94a3b8] mb-1">Publisher</div>
                  <div className="text-white flex items-center gap-2">
                    {addon.author}
                  </div>
                </div>
                {addon.is_verified && (
                  <div>
                    <div className="text-[#94a3b8] mb-1">Rating</div>
                    <div className="text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-400" />
                      Verified Safe
                    </div>
                  </div>
                )}
                {addon.link && (
                  <div>
                    {addon.link.includes('github.com') ? (
                      <a 
                        href={addon.link} 
                        onClick={(e) => handleOpenLink(e, addon.link)}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 w-fit group shadow-sm transition-colors mt-2"
                      >
                        <GithubIcon className="w-4 h-4 text-[#4f70db] group-hover:text-[#5f80eb]" />
                        <span className="text-[#94a3b8] group-hover:text-white transition-colors font-medium text-sm">
                          {addon.author} / {addon.title}
                        </span>
                      </a>
                    ) : (
                      <>
                        <div className="text-[#94a3b8] mb-1">Website</div>
                        <a 
                          href={addon.link} 
                          onClick={(e) => handleOpenLink(e, addon.link)}
                          className="text-[#4f70db] hover:underline flex items-center gap-1"
                        >
                          <Globe className="w-4 h-4" />
                          Visit Site
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
};

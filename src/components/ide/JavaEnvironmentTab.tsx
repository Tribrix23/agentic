import React, { useState, useRef, useEffect } from 'react';
import { FaJava } from 'react-icons/fa';
import { ChevronDown, ShieldAlert, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InstallPlan } from '../../lib/environment/types';

interface JavaEnvironmentTabProps {
  type: 'java' | 'javafx';
}

export const JavaEnvironmentTab: React.FC<JavaEnvironmentTabProps> = ({ type }) => {
  const isFX = type === 'javafx';
  const url = isFX ? 'https://openjfx.io/' : 'https://www.oracle.com/java/technologies/downloads/';
  const title = isFX ? 'JavaFX' : 'Java';
  const color = isFX ? 'text-[#5382a1]' : 'text-[#f8981d]';
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [catalog, setCatalog] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.electron.environment.getCatalog().then(setCatalog).catch(console.error);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const providerCatalog = catalog.find(c => c.provider === (type === 'java' ? 'jdk' : 'javafx'));
  const fallbackVersions = ['26', '25', '24', '23', '22', '21', '20', '19', '18', '17', '11', '8'];
  const mappedVersions = providerCatalog?.releases?.map((r: any) => String(r.version));
  const versions = (mappedVersions && mappedVersions.length > 0) ? mappedVersions : fallbackVersions;

  const handleInstallClick = (v: string) => {
    setShowVersionDropdown(false);
    const cleanMajor = v.split('.')[0] === '8u391' ? '8' : v.split('.')[0];
    const installPlan: InstallPlan = {
      id: `install-${type}-${v}`,
      provider: type as any,
      version: v,
      target: { scope: 'machine' },
      steps: [
        { id: 'download', description: `Download ${title} ${v}`, affectedPaths: [] },
        { id: 'install', description: `Install ${title} ${v}`, affectedPaths: [] },
        { id: 'validate', description: 'Validate the installed runtime', affectedPaths: [] },
      ],
      requiredPermissions: 'user',
      warnings: [`${title} installers run with your user permissions.`],
      rollbackStrategy: 'Remove the installation directory if installation fails.',
      artifact: {
        provider: type as any,
        version: v,
        platform: 'win32',
        architecture: 'x64',
        url: `https://api.adoptium.net/v3/binary/latest/${cleanMajor}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`,
        officialPageUrl: 'https://adoptium.net',
        format: 'archive',
        supportStatus: 'supported',
        releaseNotesUrl: 'https://adoptium.net'
      } as any
    };
    setPlan(installPlan);
  };

  const startInstall = async () => {
    if (!plan) return;
    setOperationStatus(`Installing ${title}...`);
    const currentPlan = plan;
    setPlan(null);
    
    try {
      // @ts-ignore
      await window.electron.environment.startJavaInstall(currentPlan);
      setOperationStatus(`${title} installed successfully.`);
      setTimeout(() => setOperationStatus(null), 4000);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setOperationStatus(null);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#18181f] text-[#a8a8b1] overflow-hidden relative">
      <div className="flex-none p-4 flex items-center justify-between border-b border-white/5 bg-[#0f0f13] z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
            <FaJava className={color} size={18} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-wide">{title}</h1>
            <p className="text-xs mt-1">Preview of {title} website with versions you can download.</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              className="h-8 flex items-center justify-between bg-[#08080c] border border-white/10 hover:bg-white/5 rounded text-xs px-3 w-56 transition-colors outline-none"
            >
              <span>-- Install a {title} Version --</span>
              <ChevronDown size={14} className={`text-[#8b8b93] transition-transform duration-200 ${showVersionDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showVersionDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-56 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 max-h-60 overflow-y-auto custom-scrollbar"
                >
                  {versions.map((v: string) => (
                    <button
                      key={v}
                      onClick={() => handleInstallClick(v)}
                      className="w-full text-left px-3 py-2 text-xs flex items-center justify-between text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <span>{title} {v}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      
      {error && <div className="p-2 text-xs bg-red-500/20 text-red-400">{error}</div>}
      {operationStatus && <div className="p-2 text-xs bg-blue-500/20 text-blue-400">{operationStatus}</div>}
      
      <div className="flex-1 w-full relative bg-white flex flex-col">
        {/* @ts-ignore */}
        <webview 
          src={url} 
          style={{ width: '100%', height: '100%', flex: '1 1 auto', display: 'flex' }}
          className="border-none"
        />
      </div>

      <AnimatePresence>
        {plan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="bg-[#18181f] border border-white/10 rounded-lg shadow-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center gap-2 font-semibold mb-4"><ShieldAlert className="text-amber-400" /> Confirm {title} install</div>
              <div className="space-y-2 text-sm text-[#a8a8b1] mb-6">
                {plan.steps.map(step => <div key={step.id} className="p-2 bg-black/20 rounded text-white">{step.description}</div>)}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPlan(null)} className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 rounded transition-colors">Cancel</button>
                <button onClick={startInstall} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-2 transition-colors"><Play size={14} /> Install</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

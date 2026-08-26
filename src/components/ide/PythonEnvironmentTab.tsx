import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Download, Search, Globe, ShieldAlert, Play, ChevronDown } from 'lucide-react';
import { PythonLogo } from './PythonLogo';
import type { CatalogItem, InstallPlan } from '../../lib/environment/types';
import { motion, AnimatePresence } from 'framer-motion';

interface PythonEnvironmentTabProps {
  projectRoot?: string;
}

export const PythonEnvironmentTab: React.FC<PythonEnvironmentTabProps> = ({ projectRoot }) => {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [installedVersions, setInstalledVersions] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchInstalledVersions = async () => {
    try {
      const installed = await window.electron.environment.scanPythonInstalled();
      setInstalledVersions(new Set(installed.map(i => i.version)));
    } catch (e) {
      console.error('Failed to scan installed Python versions:', e);
    }
  };

  const load = async () => {
    try {
      const items = await window.electron.environment.getCatalog();
      setCatalog(items);
      await fetchInstalledVersions();
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { load(); }, []);

  const pythonCatalog = useMemo(() => catalog.find(item => item.provider === 'python'), [catalog]);
  const pythonReleases = useMemo(() => pythonCatalog?.releases ?? [], [pythonCatalog]);

  const installPython = async (version: string) => {
    if (!projectRoot) {
      setError("Please open a project first to install Python.");
      return;
    }
    const artifact = pythonCatalog?.releases.find(release => release.version === version)?.artifact;
    if (!artifact) return;
    const installPlan: InstallPlan = {
      id: `python-${Date.now()}`,
      provider: 'python',
      version,
      target: { scope: 'project', projectRoot, selectedVersion: version },
      steps: [
        { id: 'download', description: `Download Python ${version}`, affectedPaths: [] },
        { id: 'install', description: `Install Python ${version}`, affectedPaths: [] },
        { id: 'validate', description: 'Validate the installed runtime', affectedPaths: [] },
      ],
      requiredPermissions: 'user',
      warnings: ['Python installers run with your user permissions.'],
      rollbackStrategy: 'Remove the installation directory if installation fails.',
      artifact,
    };
    setPlan(installPlan);
  };

  const startPythonInstall = async () => {
    if (!plan) return;
    setOperationStatus('Installing Python...');
    const currentPlan = plan;
    setPlan(null); // Dismiss modal immediately
    
    try {
      await window.electron.environment.startPythonInstall(currentPlan);
      setOperationStatus('Python installed successfully.');
      await fetchInstalledVersions(); // Reload to get updated installed versions
      setTimeout(() => setOperationStatus(null), 4000);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setOperationStatus(null);
    }
  };

  return (
    <div className="h-full flex flex-col min-w-0 bg-[#0f0f13] text-white">
      <div className="flex items-center gap-4 p-4 border-b border-white/10 bg-[#18181f]">
        <PythonLogo className="w-8 h-8 shrink-0" />
        <div>
          <div className="font-semibold">Python</div>
          <div className="text-xs text-[#8b8b93]">Preview of python website with versions you can download.</div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowVersionDropdown(!showVersionDropdown)}
              className="h-8 flex items-center justify-between bg-[#08080c] border border-white/10 hover:bg-white/5 rounded text-xs px-3 w-56 transition-colors outline-none"
            >
              <span>-- Install a Python Version --</span>
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
                  {pythonReleases.map(r => {
                    const isInstalled = installedVersions.has(r.version);
                    return (
                      <button
                        key={r.version}
                        disabled={isInstalled}
                        onClick={() => {
                          installPython(r.version);
                          setShowVersionDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${
                          isInstalled 
                            ? 'text-[#5b5b63] cursor-not-allowed' 
                            : 'text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors'
                        }`}
                      >
                        <span>Python {r.version}</span>
                        {isInstalled && <span className="text-[10px] text-green-500/80">Installed</span>}
                      </button>
                    );
                  })}
                  {pythonReleases.length === 0 && (
                    <div className="px-3 py-2 text-xs text-[#5b5b63]">No versions found</div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      
      {error && <div className="p-2 text-xs bg-red-500/20 text-red-400">{error}</div>}
      {operationStatus && <div className="p-2 text-xs bg-blue-500/20 text-blue-400">{operationStatus}</div>}
      
      <div className="flex-1 w-full relative bg-white flex flex-col">
        {/* @ts-ignore: webview is an Electron-specific element */}
        <webview 
          src="https://www.python.org/downloads/" 
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
              <div className="flex items-center gap-2 font-semibold mb-4"><ShieldAlert className="text-amber-400" /> Confirm Python install</div>
              <div className="space-y-2 text-sm text-[#a8a8b1] mb-6">
                {plan.steps.map(step => <div key={step.id} className="p-2 bg-black/20 rounded text-white">{step.description}</div>)}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPlan(null)} className="px-4 py-2 text-sm bg-white/5 hover:bg-white/10 rounded transition-colors">Cancel</button>
                <button onClick={startPythonInstall} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-2 transition-colors"><Play size={14} /> Install</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};


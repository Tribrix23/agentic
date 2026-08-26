import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldAlert,
  Download,
  Trash2,
  Package,
  Globe,
  Play,
} from 'lucide-react';
import { PythonLogo } from './PythonLogo';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  CatalogItem,
  InstallPlan,
  InstalledRuntime,
  PythonDependencyManifest,
  PythonPackage,
} from '../../lib/environment/types';
import popularPackagesData from './popularPackages.json';

type Tab = 'environments' | 'libraries' | 'manifest';

interface EnvironmentManagerViewProps {
  projectRoot?: string;
  onOpenPythonTab?: () => void;
}

export const EnvironmentManagerView: React.FC<EnvironmentManagerViewProps> = ({ projectRoot, onOpenPythonTab }) => {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [installed, setInstalled] = useState<InstalledRuntime[]>([]);
  const [pythonInstalled, setPythonInstalled] = useState<Array<{ version: string; executablePath: string; installRoot: string }>>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<InstallPlan | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('environments');
  const [packages, setPackages] = useState<PythonPackage[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  useEffect(() => setVisibleCount(20), [packages]);
  const [packageQuery, setPackageQuery] = useState('');
  const [manifest, setManifest] = useState<PythonDependencyManifest | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<string>('python');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  
  // Get unique providers that are actually installed
  const installedProviders = useMemo(() => Array.from(new Set(installed.map(i => i.provider))), [installed]);

  const selectedPython = useMemo(() => {
    return installed.find(i => i.provider === selectedProvider && i.source === 'project') || 
           installed.find(i => i.provider === selectedProvider) || 
           null;
  }, [installed, selectedProvider]);

  const pythonCatalog = useMemo(() => catalog.find(item => item.provider === 'python'), [catalog]);
  const pythonReleases = useMemo(() => pythonCatalog?.releases ?? [], [pythonCatalog]);
  const selectedPythonVersion = selectedPython?.version || pythonCatalog?.selectedVersion;

  const load = async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const [items, runtimes, pythonRuntimes] = await Promise.all([
        refresh ? window.electron.environment.refreshCatalog().then(result => result.catalog) : window.electron.environment.getCatalog(),
        window.electron.environment.scanInstalled(projectRoot),
        window.electron.environment.scanPythonInstalled(),
      ]);
      setCatalog(items); setInstalled(runtimes); setPythonInstalled(pythonRuntimes);
      if (projectRoot) {
        const manifestResult = await window.electron.environment.getPythonProjectManifest(projectRoot);
        setManifest(manifestResult);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [projectRoot]);

  const [installedMap, setInstalledMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (activeTab === 'libraries' && projectRoot) {
      window.electron.environment.getPythonInstalledPackages(projectRoot).then(setInstalledMap).catch(() => setInstalledMap({}));
    }
  }, [activeTab, projectRoot, selectedPython, operationStatus]);

  useEffect(() => {
    if (activeTab !== 'libraries') return;
    
    // 1. Instant local fuzzy filter
    const queryStr = packageQuery.toLowerCase().trim();
    let localResults = popularPackagesData as any[];
    if (queryStr) {
      localResults = localResults.filter(pkg => 
        pkg.name.toLowerCase().includes(queryStr) || 
        (pkg.summary && pkg.summary.toLowerCase().includes(queryStr))
      );
    }

    const hydrated = localResults.map(pkg => ({
      ...pkg,
      isInstalled: Boolean(installedMap[pkg.name.toLowerCase()]),
      installedVersion: installedMap[pkg.name.toLowerCase()] || undefined,
      installedAsProjectDependency: false,
    }));
    setPackages(hydrated);

    // 2. Network PyPI fetch for exact name (if query exists) with 150ms debounce
    if (!queryStr) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const results = await window.electron.environment.searchPythonPackages(queryStr);
        if (cancelled) return;
        setPackages(current => {
          const merged = [...current];
          for (const remote of results) {
            if (!merged.find(p => p.name.toLowerCase() === remote.name.toLowerCase())) {
               merged.unshift({
                  ...remote,
                  isInstalled: Boolean(installedMap[remote.name.toLowerCase()]),
                  installedVersion: installedMap[remote.name.toLowerCase()] || undefined,
                  installedAsProjectDependency: false,
               });
            }
          }
          return merged;
        });
      } catch {
        // Fallback to local
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [activeTab, packageQuery, installedMap]);

  const selectRuntime = async (runtime: InstalledRuntime) => {
    if (!projectRoot) return;
    setOperationStatus('Selecting runtime...');
    try {
      if (runtime.provider === 'python') {
        await window.electron.environment.selectPythonProjectEnvironment(projectRoot, runtime.executablePath);
      } else {
        await window.electron.environment.selectProject(projectRoot, {
          scope: 'project', projectRoot, executablePath: runtime.executablePath, selectedVersion: runtime.version,
        });
      }
      await load();
      setOperationStatus(null);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : String(selectError));
      setOperationStatus(null);
    }
  };

  const installPython = async (version: string) => {
    if (!projectRoot) return;
    const artifact = pythonCatalog?.releases.find(release => release.version === version)?.artifact;
    if (!artifact) {
      setError('Python release metadata is missing. Refresh the catalog and try again.');
      return;
    }
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
    try {
      await window.electron.environment.startPythonInstall(plan);
      setPlan(null);
      await load();
      setOperationStatus('Python installed successfully.');
      setTimeout(() => setOperationStatus(null), 4000);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setOperationStatus(null);
    }
  };

  const installPackage = async (packageItem: PythonPackage) => {
    if (!projectRoot || !selectedPython) return;
    setOperationStatus(`Installing ${packageItem.name}...`);
    try {
      await window.electron.environment.installPythonPackage(selectedPython.executablePath, packageItem.name, projectRoot);
      await load();
      setOperationStatus(`${packageItem.name} installed.`);
      setTimeout(() => setOperationStatus(null), 3000);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setOperationStatus(null);
    }
  };

  const uninstallPackage = async (packageItem: PythonPackage) => {
    if (!projectRoot || !selectedPython) return;
    setOperationStatus(`Uninstalling ${packageItem.name}...`);
    try {
      await window.electron.environment.uninstallPythonPackage(selectedPython.executablePath, packageItem.name, projectRoot);
      await load();
      setOperationStatus(`${packageItem.name} removed.`);
      setTimeout(() => setOperationStatus(null), 3000);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
      setOperationStatus(null);
    }
  };

  const filteredReleases = pythonReleases.filter(release => release.version.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="h-full flex flex-col min-w-0 relative">
      <div className="px-3 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold tracking-wider text-[#8b8b93] uppercase">Environment</span>
          <button title="Refresh catalog" aria-label="Refresh catalog" onClick={() => void load(true)} disabled={loading} className="p-1 text-[#8b8b93] hover:text-white disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex gap-1">
          {([
            { id: 'environments', label: 'Environments' },
            { id: 'libraries', label: 'Libraries' },
            { id: 'manifest', label: 'Manifest' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`h-7 px-2 text-[10px] font-semibold rounded ${activeTab === tab.id ? 'bg-white/10 text-white' : 'text-[#8b8b93] hover:text-white hover:bg-white/5'}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'environments' && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2">
          {!projectRoot && <div className="p-3 text-xs text-[#8b8b93] border border-white/5 rounded">Open a project to install or select a Python environment.</div>}
          {error && <div className="p-3 text-xs text-[#f48771] border border-red-500/20 rounded">{error}</div>}

          <section className="border border-white/5 rounded bg-black/10">
            <button onClick={() => onOpenPythonTab && onOpenPythonTab()} className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/5 transition-colors">
              <PythonLogo className="w-8 h-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white">Python</div>
              </div>
            </button>
          </section>

          <section className="border border-white/5 rounded bg-black/10 p-3">
            <div className="text-[11px] font-semibold text-white mb-2">Other runtimes</div>
            {installed.filter(item => item.provider !== 'python').length === 0 && <div className="text-[10px] text-[#6b6b73]">No additional runtimes detected.</div>}
            {installed.filter(item => item.provider !== 'python').map(runtime => (
              <div key={`${runtime.provider}-${runtime.executablePath}`} className="flex items-center justify-between gap-2 p-2 border border-white/5 rounded bg-black/10">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-white">{runtime.provider.toUpperCase()} {runtime.version}</div>
                  <div className="text-[10px] font-mono text-[#8b8b93] truncate">{runtime.executablePath}</div>
                </div>
                <button disabled={!projectRoot || operationStatus !== null} onClick={() => selectRuntime(runtime)} className="h-7 px-2 text-[10px] font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-40 rounded flex items-center gap-1"><Play size={12} /> Select</button>
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'libraries' && (
        <div className="flex-1 flex flex-col p-2 min-h-0">
          
          <div className="flex-none flex flex-col gap-2 mb-2">
            {!projectRoot && (
              <div className="p-3 text-xs text-[#f48771] border border-red-500/20 rounded bg-red-500/5 mb-2">
                Please open a project first to manage its libraries.
              </div>
            )}
            
            <div className="relative w-full">
              <button
                disabled={!projectRoot}
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="h-8 flex items-center justify-between bg-[#08080c] border border-white/10 hover:bg-white/5 rounded text-xs px-3 w-full transition-colors outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-2 text-white">
                  {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}
                </span>
                <ChevronDown size={14} className="text-[#8b8b93]" />
              </button>
              
              <AnimatePresence>
                {showProviderDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1 w-full bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 max-h-60 overflow-y-auto custom-scrollbar"
                  >
                    {installedProviders.map(p => (
                      <button
                        key={p}
                        onClick={() => {
                          setSelectedProvider(p);
                          setShowProviderDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors"
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    ))}
                    {installedProviders.length === 0 && (
                      <div className="px-3 py-2 text-xs text-[#5b5b63]">No runtimes installed</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>



          </div>
  
          <label className="flex-none h-8 flex items-center gap-2 px-2 bg-[#08080c] border border-white/10 rounded mb-2">
            <Search size={13} className="text-[#5b5b63]" />
            <input value={packageQuery} onChange={event => setPackageQuery(event.target.value)} placeholder={`Search ${selectedProvider.toUpperCase()} packages`} className="w-full bg-transparent text-xs text-white outline-none placeholder:text-[#5b5b63]" />
          </label>
          
          <div 
            className="flex-1 overflow-y-auto overflow-x-hidden space-y-2 custom-scrollbar"
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollHeight - target.scrollTop <= target.clientHeight * 1.5) {
                setVisibleCount(v => Math.min(v + 20, packages.length));
              }
            }}
          >
            {!selectedPython && <div className="p-3 text-xs text-[#8b8b93] border border-white/5 rounded">Select a {selectedProvider} environment first.</div>}
            {packages.slice(0, visibleCount).map(packageItem => (
            <section key={packageItem.name} className="border border-white/5 rounded bg-black/10 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 shrink-0 flex items-center justify-center bg-white/5 rounded">
                    <Package size={14} className="text-[#8b8b93]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{packageItem.name}</div>
                    <div className="text-[10px] leading-4 text-[#8b8b93] mt-0.5 line-clamp-2">{packageItem.summary}</div>
                    {packageItem.installedVersion && <div className="text-[10px] text-emerald-400 mt-1">Installed: {packageItem.installedVersion}</div>}
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  {packageItem.isInstalled ? (
                    <button disabled={!selectedPython || operationStatus !== null} onClick={() => void uninstallPackage(packageItem)} className="h-7 px-3 text-[10px] font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-40 rounded flex items-center gap-1"><Trash2 size={12} /> Uninstall</button>
                  ) : (
                    <button disabled={!selectedPython || operationStatus !== null} onClick={() => void installPackage(packageItem)} className="h-7 px-3 text-[10px] font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded flex items-center gap-1"><Download size={12} /> Install</button>
                  )}
                </div>
              </div>
              {packageItem.projectUrl && <button title="Open project page" aria-label="Open project page" onClick={() => void window.electron.environment.openOfficialLink(packageItem.projectUrl)} className="mt-2 text-[10px] text-[#8b8b93] hover:text-white flex items-center gap-1"><Globe size={12} /> {packageItem.projectUrl}</button>}
            </section>
          ))}
          {packageQuery && packages.length === 0 && <div className="p-3 text-xs text-[#8b8b93] border border-white/5 rounded">No package found.</div>}
          </div>
        </div>
      )}

      {activeTab === 'manifest' && (
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2">
          {!manifest && <div className="p-3 text-xs text-[#8b8b93] border border-white/5 rounded">No requirements.txt or pyproject.toml found in this project.</div>}
          {manifest && (
            <section className="border border-white/5 rounded bg-black/10 p-3">
              <div className="flex items-center gap-2 text-white">
                <Package size={14} />
                <span className="text-xs font-semibold">{manifest.manifestPath}</span>
              </div>
              <div className="mt-2 space-y-1">
                {manifest.packages.map(item => (
                  <div key={item.name} className="flex items-center justify-between gap-2 text-[11px]">
                    <div>
                      <span className="text-white">{item.name}</span>
                      {item.versionSpec && <span className="text-[#8b8b93] ml-1">{item.versionSpec}</span>}
                      {item.installedVersion && <span className="text-emerald-400 ml-1">({item.installedVersion})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {plan && (
        <div role="dialog" aria-modal="true" aria-label="Python install plan" className="absolute inset-2 z-40 bg-[#0f0f13] border border-white/10 rounded shadow-2xl p-3 overflow-y-auto">
          <div className="flex items-center gap-2 text-xs font-semibold"><ShieldAlert size={15} className="text-amber-400" /> Confirm Python install</div>
          <div className="mt-3 space-y-2 text-[10px] text-[#a8a8b1]">
            {plan.steps.map(step => <div key={step.id} className="p-2 bg-black/20 rounded"><div className="text-white">{step.description}</div></div>)}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setPlan(null)} className="h-8 px-3 text-xs bg-white/5 hover:bg-white/10 rounded">Cancel</button>
            <button onClick={startPythonInstall} className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-500 rounded flex items-center gap-1"><Play size={12} /> Install</button>
          </div>
        </div>
      )}
    </div>
  );
};

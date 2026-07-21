import React, { useState, useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileJson, FileType2, FileCode2, Code, FileImage, FileText, File, 
  X, Save, Menu, Play, StopCircle, Radio, Check, Settings, Shield
} from 'lucide-react';
import { cn } from '../../App';

const EditorSkeleton = () => (
  <div className="flex-1 w-full h-full p-6 flex flex-col gap-4 select-none pointer-events-none">
    <div className="h-4 bg-white/10 rounded w-1/3 animate-pulse" />
    <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse" />
    <div className="h-4 bg-white/5 rounded w-1/4 animate-pulse ml-8" />
    <div className="h-4 bg-white/5 rounded w-2/3 animate-pulse ml-8" />
    <div className="h-4 bg-white/10 rounded w-1/3 animate-pulse ml-8" />
    <div className="h-4 bg-white/5 rounded w-1/5 animate-pulse" />
    <div className="h-4 bg-white/5 rounded w-1/4 animate-pulse" />
  </div>
);

import { SiReact, SiTypescript, SiJavascript, SiHtml5, SiCss, SiJson, SiMarkdown, SiTailwindcss, SiVite } from 'react-icons/si';
import { VscFileMedia, VscFile } from 'react-icons/vsc';
import { DiNpm } from 'react-icons/di';
import { FaGitAlt } from 'react-icons/fa';

const getFileIcon = (filename: string, className?: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (filename.startsWith('.env')) {
    return <Settings size={14} className={className || "text-[#2dd4bf] shrink-0"} />;
  }
  if (filename === '.gitignore' || filename === '.gitattributes') {
    return <FaGitAlt size={14} className={className || "text-[#f34f29] shrink-0"} />;
  }
  if (filename === 'package.json' || filename === 'package-lock.json') {
    return <DiNpm size={14} className={className || "text-[#cb3837] shrink-0"} />;
  }
  if (filename === 'tailwind.config.js' || filename === 'tailwind.config.ts') {
    return <SiTailwindcss size={14} className={className || "text-[#38bdf8] shrink-0"} />;
  }
  if (filename === 'vite.config.js' || filename === 'vite.config.ts') {
    return <SiVite size={14} className={className || "text-[#646cff] shrink-0"} />;
  }

  switch (ext) {
    case 'json': case 'tsbuildinfo': return <SiJson size={14} className={className || "text-[#fbc02d] shrink-0"} />;
    case 'ts': return <SiTypescript size={14} className={className || "text-[#3178c6] shrink-0"} />;
    case 'tsx': return <SiReact size={14} className={className || "text-[#61dafb] shrink-0"} />;
    case 'js': return <SiJavascript size={14} className={className || "text-[#f7df1e] shrink-0"} />;
    case 'jsx': return <SiReact size={14} className={className || "text-[#61dafb] shrink-0"} />;
    case 'html': return <SiHtml5 size={14} className={className || "text-[#e34c26] shrink-0"} />;
    case 'css': return <SiCss size={14} className={className || "text-[#264de4] shrink-0"} />;
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif': case 'ico': case 'webp': return <VscFileMedia size={14} className={className || "text-[#4caf50] shrink-0"} />;
    case 'md': case 'txt': return <SiMarkdown size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
    default: return <VscFile size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
  }
};

const getFileLanguage = (filename: string | null) => {
  if (!filename) return 'plaintext';
  if (filename === '.gitignore' || filename.startsWith('.env')) return 'plaintext';
  
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'json': case 'tsbuildinfo': return 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
};

import { OpenFile } from '../IdeContainer';

interface EditorAreaProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  isLiveServerRunning: boolean;
  onTabClose: (path: string) => void;
  onTabClick: (path: string) => void;
  handleRunLive: () => void;
  handleStopLive: () => void;
  onFileSaved: (path: string, newContent: string) => void;
  gitStatusMap?: Record<string, string>;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  openFiles,
  activeFilePath,
  isLiveServerRunning,
  onTabClose,
  onTabClick,
  handleRunLive,
  handleStopLive,
  onFileSaved,
  gitStatusMap
}) => {
  const [localContents, setLocalContents] = useState<Record<string, string>>({});
  const [showEditorMenu, setShowEditorMenu] = useState(false);
  const editorMenuRef = useRef<HTMLDivElement>(null);

  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('quantix_autosave');
    return saved === 'true';
  });

  const toggleAutoSave = () => {
    const newValue = !autoSaveEnabled;
    setAutoSaveEnabled(newValue);
    localStorage.setItem('quantix_autosave', String(newValue));
  };

  useEffect(() => {
    setLocalContents(prev => {
      const next = { ...prev };
      let changed = false;
      for (const f of openFiles) {
        if (next[f.path] === undefined) {
          next[f.path] = f.originalContent;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [openFiles]);

  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const selectedFileName = activeFile?.name;
  
  const currentLocalContent = activeFilePath ? (localContents[activeFilePath] ?? activeFile?.originalContent ?? '') : '';
  const isDirty = activeFilePath ? currentLocalContent !== activeFile?.originalContent : false;

  const handleSaveFile = async () => {
    if (activeFilePath && isDirty) {
      const res = await (window as any).electron.saveFileContent(activeFilePath, currentLocalContent);
      if (res.success) {
        onFileSaved(activeFilePath, currentLocalContent);
      } else {
        console.error('Failed to save file:', res.error);
      }
    }
  };

  useEffect(() => {
    if (autoSaveEnabled && isDirty && activeFilePath) {
      const timeoutId = setTimeout(() => {
        handleSaveFile();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [currentLocalContent, autoSaveEnabled, isDirty, activeFilePath]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorMenuRef.current && !editorMenuRef.current.contains(event.target as Node)) {
        setShowEditorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeFilePath, isDirty, currentLocalContent]);

  if (!activeFilePath || openFiles.length === 0) return null;

  return (
    <>
      <div className="h-9 border-b border-white/5 bg-[#0f0f13] flex items-center justify-between px-2">
        <div className="flex items-center overflow-x-auto no-scrollbar flex-1 h-full pt-1.5">
          {openFiles.map(file => {
            const isTabActive = file.path === activeFilePath;
            const tabLocalContent = localContents[file.path] ?? file.originalContent;
            const tabIsDirty = tabLocalContent !== file.originalContent;

            const normalizedPath = file.path.replace(/\\/g, '/');
            const gitStatusKey = gitStatusMap ? Object.keys(gitStatusMap).find(k => normalizedPath.endsWith(k)) : undefined;
            const gitStatus = gitStatusKey ? gitStatusMap[gitStatusKey] : undefined;
              
            const isModified = gitStatus?.includes('M');
            const isUntracked = gitStatus?.includes('?') || gitStatus?.includes('A');
            const textColorClass = isModified ? "text-[#e2c08d]" 
                                 : isUntracked ? "text-[#73c991]" 
                                 : isTabActive ? "text-white" 
                                 : "text-[#8b8b93]";

            return (
              <div 
                key={file.path}
                onClick={() => onTabClick(file.path)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-full min-w-[120px] max-w-[200px] border-r border-white/5 cursor-pointer group relative transition-colors rounded-t-md",
                  isTabActive 
                    ? "bg-[#1e1e1e] border-t-2 border-t-blue-500" 
                    : "bg-[#0f0f13] hover:bg-[#18181f] border-t-2 border-t-transparent",
                  textColorClass
                )}
              >
                {getFileIcon(file.name, "w-3 h-3 shrink-0")}
                <span className="truncate flex-1 text-xs">{file.name}</span>
                {tabIsDirty && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 ml-1" title="Unsaved changes" />}
                
                {gitStatus && !tabIsDirty && (
                  <span className={cn(
                    "text-[9px] font-bold shrink-0 ml-1 opacity-80",
                    isModified ? "text-[#e2c08d]" : isUntracked ? "text-[#73c991]" : "text-[#f48771]"
                  )}>
                    {gitStatus.includes('?') ? 'U' : gitStatus.trim()[0]}
                  </span>
                )}
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(file.path);
                  }}
                  className={cn(
                    "p-0.5 rounded transition-all shrink-0",
                    isTabActive ? "opacity-100 hover:bg-white/10" : "opacity-0 group-hover:opacity-100 hover:bg-white/10"
                  )}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pr-2">

          <button
            onClick={handleSaveFile}
            disabled={!isDirty}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm border",
              isDirty 
                ? "bg-[#25252d] hover:bg-[#2f2f38] border-white/5 text-white shadow-md" 
                : "bg-transparent border-transparent text-[#5b5b63] cursor-not-allowed shadow-none"
            )}
          >
            <Save size={13} className={cn(isDirty ? "text-white" : "text-[#5b5b63]")} />
            Save
            <div className={cn(
              "flex items-center ml-1.5 px-2 py-0.5 rounded backdrop-blur-md shadow-inner text-[10px] tracking-wider font-bold transition-all",
              isDirty ? "bg-white/10 text-white border border-white/5" : "bg-black/20 text-[#5b5b63]"
            )}>
              CTRL + S
            </div>
          </button>
          
          <div className="relative" ref={editorMenuRef}>
            <button
              onClick={() => setShowEditorMenu(!showEditorMenu)}
              className="p-1.5 rounded-md hover:bg-white/5 text-[#8b8b93] hover:text-white transition-colors ml-1"
            >
              <Menu size={16} />
            </button>
            <AnimatePresence>
              {showEditorMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-40 bg-[#18181f] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50 py-1"
                >
                  {isLiveServerRunning ? (
                    <button
                      onClick={handleStopLive}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      <StopCircle size={14} className="text-red-500" />
                      Stop Live
                    </button>
                  ) : (
                    <button
                      onClick={handleRunLive}
                      disabled={!selectedFileName?.toLowerCase().endsWith('.html')}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                        selectedFileName?.toLowerCase().endsWith('.html') 
                          ? "text-white hover:bg-white/10" 
                          : "text-[#5b5b63] cursor-not-allowed opacity-50"
                      )}
                    >
                      <Play size={14} className={selectedFileName?.toLowerCase().endsWith('.html') ? "text-green-500" : "text-[#5b5b63]"} />
                      Run Live
                    </button>
                  )}
                  
                  <div className="border-t border-white/5 my-1" />
                  
                  <button
                    onClick={() => {
                      toggleAutoSave();
                      setShowEditorMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <Save size={14} className={autoSaveEnabled ? "text-blue-400" : "text-white"} />
                      <span className="text-white">Auto Save</span>
                    </div>
                    {autoSaveEnabled && <Check size={14} className="text-blue-400" />}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[#1e1e1e] relative">
        {currentLocalContent.startsWith('data:image/') ? (
          <div className="w-full h-full flex items-center justify-center bg-[#0f0f13] overflow-auto p-4">
            <img src={currentLocalContent} alt={selectedFileName} className="max-w-[80%] max-h-[80%] object-contain drop-shadow-2xl" />
          </div>
        ) : (
          <Editor
            height="100%"
            language={getFileLanguage(selectedFileName || null)}
            theme="vs-dark"
            value={currentLocalContent}
            onChange={(value) => {
              if (activeFilePath) {
                setLocalContents(prev => ({
                  ...prev,
                  [activeFilePath]: value || ''
                }));
              }
            }}
            loading={<EditorSkeleton />}
            beforeMount={(monaco) => {
              const ts = monaco.languages.typescript as any;
              ts.typescriptDefaults.setCompilerOptions({
                jsx: ts.JsxEmit.React,
                jsxFactory: 'React.createElement',
                reactNamespace: 'React',
                allowNonTsExtensions: true,
                allowJs: true,
                target: ts.ScriptTarget.Latest,
              });
              ts.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: false,
              });
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              formatOnPaste: true,
            }}
          />
        )}
      </div>
    </>
  );
};

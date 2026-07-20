import React, { useState, useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';

loader.config({ paths: { vs: '/monaco/vs' } });

import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileJson, FileType2, FileCode2, Code, FileImage, FileText, File, 
  X, Save, Menu, Play, StopCircle, Radio 
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

const getFileIcon = (filename: string, className?: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json': return <FileJson size={14} className={className || "text-[#fbc02d] shrink-0"} />;
    case 'ts': case 'tsx': return <FileType2 size={14} className={className || "text-[#3178c6] shrink-0"} />;
    case 'js': case 'jsx': return <FileCode2 size={14} className={className || "text-[#f7df1e] shrink-0"} />;
    case 'html': return <Code size={14} className={className || "text-[#e34c26] shrink-0"} />;
    case 'css': return <FileCode2 size={14} className={className || "text-[#264de4] shrink-0"} />;
    case 'png': case 'jpg': case 'jpeg': case 'svg': case 'gif': case 'ico': return <FileImage size={14} className={className || "text-[#4caf50] shrink-0"} />;
    case 'md': case 'txt': return <FileText size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
    default: return <File size={14} className={className || "text-[#a8a8b1] shrink-0"} />;
  }
};

const getFileLanguage = (filename: string | null) => {
  if (!filename) return 'javascript';
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return 'javascript';
    case 'ts': case 'tsx': return 'typescript';
    case 'json': return 'json';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'md': return 'markdown';
    default: return 'javascript';
  }
};

interface EditorAreaProps {
  selectedFilePath: string | null;
  selectedFileName: string | null;
  originalFileContent: string;
  isLiveServerRunning: boolean;
  onCloseFile: () => void;
  handleRunLive: () => void;
  handleStopLive: () => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  selectedFilePath,
  selectedFileName,
  originalFileContent,
  isLiveServerRunning,
  onCloseFile,
  handleRunLive,
  handleStopLive
}) => {
  const [localContent, setLocalContent] = useState(originalFileContent);
  const [showEditorMenu, setShowEditorMenu] = useState(false);
  const editorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalContent(originalFileContent);
  }, [selectedFilePath, originalFileContent]);

  const isDirty = localContent !== originalFileContent;

  const handleSaveFile = async () => {
    if (selectedFilePath && isDirty) {
      const res = await (window as any).electron.saveFileContent(selectedFilePath, localContent);
      if (res.success) {
        // success
      } else {
        console.error('Failed to save file:', res.error);
      }
    }
  };

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
  }, [selectedFilePath, isDirty, localContent]);

  if (!selectedFileName) return null;

  return (
    <>
      <div className="h-9 border-b border-white/5 bg-[#0f0f13] flex items-center justify-between px-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#08080c] border-b-2 border-blue-500 rounded-t-md text-xs font-medium text-white group relative">
          {getFileIcon(selectedFileName, "w-3 h-3 shrink-0")}
          <span>{selectedFileName}</span>
          {isDirty && <div className="w-2 h-2 rounded-full bg-blue-500 ml-1" title="Unsaved changes" />}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onCloseFile();
            }}
            className="ml-2 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex items-center gap-2 pr-2">
          <AnimatePresence>
            {isLiveServerRunning && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="relative group mr-1"
              >
                <div className="flex items-center justify-center p-1.5 rounded-full bg-purple-500/20 text-purple-400 relative cursor-pointer">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  >
                    <Radio size={14} />
                  </motion.div>
                  <motion.div
                    animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                    className="absolute inset-0 rounded-full border border-purple-500/50"
                  />
                </div>
                
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-black/90 text-white text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap z-50 border border-white/10 shadow-xl">
                  Live server is on
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors"
                    >
                      <Play size={14} className="text-green-500" />
                      Run Live
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[#1e1e1e] relative">
        <Editor
          height="100%"
          language={getFileLanguage(selectedFileName)}
          theme="vs-dark"
          value={localContent}
          onChange={(value) => setLocalContent(value || '')}
          loading={<EditorSkeleton />}
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
      </div>
    </>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { AIConfig, setAIConfig } from '../../lib/aiConfig';
import { FileAttachment } from '../../lib/messageTypes';
import { Bot, Paperclip, ArrowUp, Square, ChevronDown, HardDrive, Cloud, Send, Mic } from 'lucide-react';
import { FileContextBadge } from './FileContextBadge';
import { motion, AnimatePresence } from 'framer-motion';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface PromptInputProps {
  onSend: (content: string, attachments?: FileAttachment[], mentionedFiles?: string[]) => void;
  onStop?: () => void;
  isAgentRunning: boolean;
  config: AIConfig;
  projectFiles?: any[];
}

export function PromptInput({ onSend, onStop, isAgentRunning, config, projectFiles }: PromptInputProps) {
  const [content, setContent] = useState('');
  const [mentionedFiles, setMentionedFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) setShowModelDropdown(false);
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(target)) setShowModeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(Math.max(textareaRef.current.scrollHeight, 40), 200) + 'px';
    }
  }, [content]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (content.trim()) {
        onSend(content.trim(), undefined, mentionedFiles);
        setContent('');
        setMentionedFiles([]);
      }
    }
  };

  const updateConfig = (partial: Partial<AIConfig>) => {
    setAIConfig(partial, undefined);
  };

  return (
    <div className="flex flex-col gap-2 relative w-full mx-auto max-w-[750px]">
      {mentionedFiles.length > 0 && (
        <div className="flex gap-2 flex-wrap px-2">
          {mentionedFiles.map(file => (
            <FileContextBadge 
              key={file} 
              filePath={file} 
              onRemove={() => setMentionedFiles(prev => prev.filter(f => f !== file))} 
            />
          ))}
        </div>
      )}
      
      <div className="w-full bg-[#1c1c21] border border-white/5 rounded-2xl p-3 flex flex-col shadow-2xl focus-within:border-white/20 transition-colors pointer-events-auto">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything, @ to mention, / for actions"
          className="w-full bg-transparent resize-none outline-none text-[#e2e2e3] text-[14px] placeholder-[#6b6b73] custom-scrollbar min-h-[40px] max-h-[200px]"
          rows={1}
        />
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => updateConfig({ agentMode: !config.agentMode })}
              className={cn(
                "flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-all",
                config.agentMode
                  ? "text-purple-300 bg-purple-500/15 border border-purple-500/30"
                  : "text-[#8b8b93] hover:text-white bg-white/5 border border-transparent"
              )}
            >
              <Bot size={14} />
              {config.agentMode ? 'Agent' : 'Chat'}
            </button>

            <div className="relative" ref={modelDropdownRef}>
              <button 
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1 text-[12px] text-[#a8a8b1] hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-md"
              >
                {config.model}
                <ChevronDown size={12} />
              </button>
              <AnimatePresence>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-40 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                  >
                    {['Dispatcher v1', 'Dispatcher v1.2', 'Dispatcher v2'].map(model => (
                      <button 
                        key={model}
                        onClick={() => { 
                          updateConfig({ model });
                          setShowModelDropdown(false); 
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                          config.model === model ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                        )}
                      >
                        {model}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" ref={modeDropdownRef}>
              <button 
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className="flex items-center gap-1 text-[12px] text-[#a8a8b1] hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-md"
              >
                {config.mode === 'local' ? <HardDrive size={12} /> : <Cloud size={12} />}
                {config.mode === 'local' ? 'Local' : 'Cloud'}
                <ChevronDown size={12} />
              </button>
              <AnimatePresence>
                {showModeDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-32 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                  >
                    {['local', 'cloud'].map(mode => (
                      <button 
                        key={mode}
                        onClick={() => { 
                          updateConfig({ mode: mode as 'local'|'cloud' });
                          setShowModeDropdown(false); 
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                          config.mode === mode ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                        )}
                      >
                        {mode === 'local' ? <HardDrive size={14} /> : <Cloud size={14} />}
                        {mode === 'local' ? 'Local' : 'Cloud'}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isAgentRunning ? (
              <button 
                onClick={onStop}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button 
                onClick={() => {
                  if(content.trim()) {
                    onSend(content.trim(), undefined, mentionedFiles);
                    setContent('');
                    setMentionedFiles([]);
                  }
                }}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  content.trim().length > 0
                    ? "bg-[#007acc] hover:bg-[#0088dd] text-white shadow-lg"
                    : "bg-white/5 hover:bg-white/10 text-[#8b8b93] hover:text-white"
                )}
              >
                {content.trim().length > 0 ? <Send size={14} /> : <Mic size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

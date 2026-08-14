import React, { useState, useRef, useEffect } from 'react';
import { AIConfig, setAIConfig } from '../../lib/aiConfig';
import { FileAttachment } from '../../lib/messageTypes';
import { Bot, Paperclip, ArrowUp, Square, ChevronDown, ChevronRight, HardDrive, Cloud, Send, Mic, Network, Zap, Brain, Sparkles, Search } from 'lucide-react';
import { SiAnthropic, SiAlibabacloud } from 'react-icons/si';
import { motion, AnimatePresence } from 'framer-motion';
import { FileContextBadge } from './FileContextBadge';

const OpenAIIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A6.0651 6.0651 0 0 0 19.0192 19.818a5.9847 5.9847 0 0 0 3.9977-2.9 6.0462 6.0462 0 0 0-.735-7.0969zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829v-2.3324a.0757.0757 0 0 1 .0332-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66 4.4755 4.4755 0 0 1-.5393 3.0137l-.142-.0852-4.783-2.7582a.7712.7712 0 0 0-.7806 0zM8.8435 3.6446a4.4755 4.4755 0 0 1 2.8764 1.0407l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813V14.942l-2.02-1.1686a.071.071 0 0 1-.038-.052V8.1388a4.504 4.504 0 0 1 4.4945-4.4942zm7.4093 4.4578l-5.8144-3.3543 2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7865a4.504 4.504 0 0 1-2.3655 7.973V8.7789a.7664.7664 0 0 0-.3879-.6765zM15.421 11.25l-3.421-1.972-3.421 1.972v3.944l3.421 1.972 3.421-1.972v-3.944z" />
  </svg>
);

const QwenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <defs>
      <linearGradient id="qwen-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stopColor="#6336E7" stopOpacity="0.84"/>
        <stop offset="100%" stopColor="#6F69F7" stopOpacity="0.84"/>
      </linearGradient>
    </defs>
    <path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z" fill="url(#qwen-gradient)" fillRule="nonzero"/>
  </svg>
);

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface PromptInputProps {
  onSend: (content: string, attachments?: FileAttachment[], mentionedFiles?: string[]) => void;
  onStop?: () => void;
  isAgentRunning: boolean;
  config: AIConfig;
  projectFiles?: any[];
  onConfigChange?: (partial: Partial<AIConfig>) => void;
  value?: string;
  onChange?: (val: string) => void;
}

export function PromptInput({ onSend, onStop, isAgentRunning, config, projectFiles, onConfigChange, value, onChange }: PromptInputProps) {
  const [localContent, setLocalContent] = useState('');
  const content = value !== undefined ? value : localContent;
  const setContent = onChange || setLocalContent;
  const [mentionedFiles, setMentionedFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [uiMode, setUiMode] = useState<'local' | 'cloud'>('local');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  const allModels = [
    { id: 'dispatcher', name: 'Dispatcher', icon: <img src="/DispatcherIcon.png" alt="" className="w-3.5 h-3.5 object-contain" />, submodels: ['Dispatcher v1.5', 'Dispatcher v2'], isPro: false },
    { id: 'gpt-oss', name: 'GPT-OSS 120B', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: ['Medium', 'High'], isPro: false },
    { id: 'qwen', name: 'Qwen 3.7', icon: <QwenIcon className="w-3.5 h-3.5 text-[#FF6A00]" />, submodels: ['Flash', 'Plus', 'Max'], isPro: true },
    { id: 'gpt56', name: 'GPT-5.6', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: ['Luna', 'Terra', 'Sol'], isPro: true },
    { id: 'claude', name: 'Claude Fable 5', icon: <SiAnthropic className="w-3.5 h-3.5 text-[#D3A982]" />, submodels: [], isPro: true },
  ];

  const filteredModels = allModels.filter(model => 
    model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    model.submodels.some(sub => sub.toLowerCase().includes(modelSearchQuery.toLowerCase()))
  );
  
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  const getModelIcon = (model: string) => {
    if (model.includes('GPT-OSS') || model.includes('GPT-5.6')) return <OpenAIIcon className="w-3.5 h-3.5 text-white" />;
    if (model.includes('Qwen')) return <QwenIcon className="w-4 h-4 text-[#FF6A00]" />;
    if (model.includes('Claude')) return <SiAnthropic className="w-3.5 h-3.5 text-[#D3A982]" />;
    return <img src="/DispatcherIcon.png" alt="" className="w-4 h-4 object-contain" />;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) setShowModelDropdown(false);
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(target)) setShowModeDropdown(false);
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(target)) setShowAgentDropdown(false);
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
    if (onConfigChange) {
      onConfigChange(partial);
    }
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
            <div className="relative" ref={agentDropdownRef}>
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className={cn(
                  "flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-all",
                  config.agentMode
                    ? "text-purple-300 bg-purple-500/15 border border-purple-500/30"
                    : "text-[#8b8b93] hover:text-white bg-white/5 border border-transparent"
                )}
              >
                {config.agentMode ? <Bot size={14} className="text-white" /> : <Mic size={14} />}
                <span className={cn(config.agentMode ? "text-white font-bold anaglyph tracking-wide" : "")}>
                  {config.agentMode ? 'Code' : 'Ask'}
                </span>
                <ChevronDown size={12} className={cn("transition-transform duration-200 opacity-60", showAgentDropdown ? "rotate-180" : "")} />
              </button>
              <AnimatePresence>
                {showAgentDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-32 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        updateConfig({ agentMode: true });
                        setShowAgentDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                        config.agentMode ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Bot size={14} />
                      Code
                    </button>
                    <button
                      onClick={() => {
                        updateConfig({ agentMode: false });
                        setShowAgentDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                        !config.agentMode ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Mic size={14} />
                      Ask
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div 
              className="relative" 
            >
              <button 
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1.5 text-[12px] text-[#a8a8b1] hover:text-white transition-colors bg-[#202025] hover:bg-[#2a2a30] px-3 py-1.5 rounded-md border border-white/5"
              >
                {getModelIcon(config.model || 'Dispatcher v2')}
                <span className="font-medium text-white">{config.model || 'Dispatcher v2'}</span>
                <ChevronDown size={12} className={cn("transition-transform duration-200 opacity-60", showModelDropdown ? "rotate-180" : "")} />
              </button>
              <AnimatePresence>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute bottom-full left-0 mb-2 w-56 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-2 z-50 overflow-visible flex flex-col gap-0.5"
                  >
                    {/* Search Input */}
                    <div className="px-2 pb-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                          type="text"
                          placeholder="Search models..."
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          className="w-full bg-[#1a1a20] border border-white/10 rounded-md pl-7 pr-2 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-white/20"
                        />
                      </div>
                    </div>

                    {filteredModels.map((model) => (
                      <div 
                        key={model.id}
                        className="relative w-full"
                        onMouseEnter={() => setHoveredCategory(model.id)}
                      >
                        {model.submodels.length > 0 ? (
                          <>
                            <button className={cn("w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors", hoveredCategory === model.id ? "bg-white/10 text-white" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}>
                              <span className="flex items-center gap-2">
                                {model.icon}
                                {model.name}
                                {model.isPro && <span className="text-[8px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded font-medium">PRO+</span>}
                              </span>
                              <ChevronRight size={12} />
                            </button>
                            <AnimatePresence>
                              {hoveredCategory === model.id && (
                                <motion.div
                                  initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -5 }} transition={{ duration: 0.15 }}
                                  className="absolute top-0 left-full ml-1 w-32 bg-[#16161a] border border-white/10 rounded-lg shadow-xl py-1 flex flex-col z-50"
                                >
                                  {model.submodels.map(m => (
                                    <button 
                                      key={m} 
                                      onClick={() => { updateConfig({ model: model.id === 'gpt-oss' ? `GPT-OSS ${m}` : model.id === 'qwen' ? `Qwen 3.7 ${m}` : model.id === 'gpt56' ? `GPT-5.6 ${m}` : m }); setShowModelDropdown(false); }} 
                                      className="px-3 py-1.5 text-xs text-left text-[#a8a8b1] hover:text-white hover:bg-white/10"
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        ) : (
                          <button 
                            onClick={() => { updateConfig({ model: model.name }); setShowModelDropdown(false); }}
                            className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              {model.icon}
                              {model.name}
                              {model.isPro && <span className="text-[8px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded font-medium">PRO+</span>}
                            </span>
                          </button>
                        )}
                      </div>
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
                {uiMode === 'local' ? <HardDrive size={12} /> : <Cloud size={12} />}
                {uiMode === 'local' ? 'Local' : 'Cloud'}
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
                          setUiMode(mode as 'local' | 'cloud');
                          setShowModeDropdown(false); 
                        }}
                        className={cn(
                          "w-full px-3 py-2 text-left text-xs flex items-center gap-2 transition-colors",
                          uiMode === mode ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
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

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AIConfig, setAIConfig } from '../../lib/aiConfig';
import { FileAttachment } from '../../lib/messageTypes';
import { Bot, Paperclip, ArrowUp, Square, ChevronDown, ChevronRight, HardDrive, Cloud, Send, Mic, Network, Zap, Brain, Sparkles, Search, Gauge, Plus, Image as ImageIcon, X, Copy, Download, ClipboardList, Check } from 'lucide-react';
import { SiAnthropic, SiAlibabacloud } from 'react-icons/si';
import { motion, AnimatePresence } from 'framer-motion';
import { FileContextBadge } from './FileContextBadge';
import { OpenAIIcon } from '../icons/OpenAIIcon';
import { fetchTokenQuota, getQuotaTarget, TokenQuotaSnapshot } from '../../lib/tokenQuota';
import { TokenBudget } from '../../lib/tokenCounter';

const QwenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <defs>
      <linearGradient id="qwen-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
        <stop offset="0%" stopColor="#6336E7" stopOpacity="0.84" />
        <stop offset="100%" stopColor="#6F69F7" stopOpacity="0.84" />
      </linearGradient>
    </defs>
    <path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z" fill="url(#qwen-gradient)" fillRule="nonzero" />
  </svg>
);

const DeepSeekIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078.253.253 0 0 1-.114-.358c.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" />
  </svg>
);

const KimiIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M4 4H8.2V9.9L14.1 4H19.5L12.1 11.2L20 20H14.4L8.2 13.2V20H4V4Z"
      fill="currentColor"
    />
  </svg>
);

const GLMIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 159 158"
    fill="#FFFFFF"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M136 30H92L20 129H65L136 30Z" />
    <path d="M24 43H68L77 30H33L24 43Z" />
    <path d="M79 129H123L133 116H88L79 129Z" />
  </svg>
);

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

const TokenCircleIndicator = ({ budget }: { budget: TokenBudget }) => {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (budget.utilizationPercent / 100) * circumference;
  
  // Calculate raw number for tooltip (e.g. 144K)
  const formatK = (num: number) => (num > 1000 ? (num / 1000).toFixed(0) + 'K' : num.toString());
  const usedTokens = budget.total - budget.available;

  let colorClass = "text-gray-400";
  if (budget.utilizationPercent > 90) colorClass = "text-red-500";
  else if (budget.utilizationPercent > 75) colorClass = "text-amber-500";

  return (
    <div className="relative group flex items-center justify-center mr-2">
      <svg className="w-4 h-4 transform -rotate-90" viewBox="0 0 16 16">
        {/* Background circle */}
        <circle
          cx="8"
          cy="8"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-gray-700/50"
        />
        {/* Progress circle */}
        <circle
          cx="8"
          cy="8"
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn("transition-all duration-300", colorClass)}
          strokeLinecap="round"
        />
      </svg>
      
      {/* Tooltip */}
      <div className="absolute bottom-full mb-2 right-[-8px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        <div className="bg-[#2d2d30] text-gray-300 text-[11px] px-2.5 py-1.5 rounded shadow-lg border border-[#3e3e42] flex flex-col items-center gap-0.5">
          <span className="font-medium text-white">{budget.utilizationPercent.toFixed(0)}% ({formatK(usedTokens)} / {formatK(budget.total)}) context used</span>
        </div>
        <div className="w-2 h-2 bg-[#2d2d30] border-b border-r border-[#3e3e42] transform rotate-45 absolute -bottom-1 right-3"></div>
      </div>
    </div>
  );
};

interface PromptInputProps {
  onSend: (content: string, attachments?: FileAttachment[], mentionedFiles?: string[]) => void;
  onStop?: () => void;
  isAgentRunning: boolean;
  config: AIConfig;
  projectFiles?: any[];
  onConfigChange?: (partial: Partial<AIConfig>) => void;
  value?: string;
  onChange?: (val: string) => void;
  hasProject?: boolean;
  userId?: string;
  tokenBudget?: TokenBudget;
}

export function PromptInput({ onSend, onStop, isAgentRunning, config, projectFiles, onConfigChange, value, onChange, hasProject = true, userId, tokenBudget }: PromptInputProps) {
  const [localContent, setLocalContent] = useState('');
  const content = value !== undefined ? value : localContent;
  const setContent = onChange || setLocalContent;
  const [mentionedFiles, setMentionedFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [selectedImages, setSelectedImages] = useState<{ url: string; file: File }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageCopied, setIsImageCopied] = useState(false);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredCategoryPosition, setHoveredCategoryPosition] = useState<{ top: number; left: number } | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [tokenQuota, setTokenQuota] = useState<TokenQuotaSnapshot | null>(null);
  const modelItemRefs = useRef<Record<string, HTMLDivElement>>({});

  const allModels = [
    { id: 'dispatcher', name: 'Dispatcher v1', icon: <img src="./DispatcherIcon.png" alt="" className="w-3.5 h-3.5 object-contain" />, submodels: [], isPro: false },
    { id: 'gpt-oss', name: 'GPT-OSS 120B', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: ['Medium', 'High'], isPro: false },
    { id: 'qwen', name: 'Qwen 3.7', icon: <QwenIcon className="w-3.5 h-3.5 text-[#FF6A00]" />, submodels: ['Flash', 'Plus', 'Max'], isPro: true },
    { id: 'qwen38', name: 'Qwen 3.8', icon: <QwenIcon className="w-3.5 h-3.5 text-[#623AE7]" />, submodels: [], isPro: true },
    { id: 'gpt56', name: 'GPT-5.6', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: ['Luna', 'Terra', 'Sol'], isPro: true },
    { id: 'deepseek', name: 'DeepSeek v4', icon: <DeepSeekIcon className="w-3.5 h-3.5 text-[#4D6BFE]" />, submodels: ['Flash', 'Pro'], isPro: true },
    { id: 'kimi', name: 'Kimi k2.7', icon: <KimiIcon className="w-3.5 h-3.5 text-[#6366F1]" />, submodels: [], isPro: true },
    { id: 'glm', name: 'GLM 5.2', icon: <GLMIcon className="w-3.5 h-3.5 text-[#10B981]" />, submodels: ['5.2', '5.2 Lite'], isPro: true },
    { id: 'claude', name: 'Claude Fable 5', icon: <SiAnthropic className="w-3.5 h-3.5 text-[#D3A982]" />, submodels: [], isPro: true },
  ];

  const filteredModels = allModels.filter(model =>
    model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    model.submodels.some(sub => sub.toLowerCase().includes(modelSearchQuery.toLowerCase()))
  );

  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const plusDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSelectedImages(prev => [...prev, { url: e.target!.result as string, file }]);
      }
    };
    reader.readAsDataURL(file);
  };

  const getModelIcon = (model: string) => {
    if (model.includes('GPT-OSS') || model.includes('GPT-5.6')) return <OpenAIIcon className="w-3.5 h-3.5 text-white" />;
    if (model.includes('Qwen')) return <QwenIcon className="w-4 h-4 text-[#FF6A00]" />;
    if (model.includes('DeepSeek')) return <DeepSeekIcon className="w-3.5 h-3.5 text-[#4D6BFE]" />;
    if (model.includes('Kimi')) return <KimiIcon className="w-3.5 h-3.5 text-[#6366F1]" />;
    if (model.includes('GLM')) return <GLMIcon className="w-3.5 h-3.5 text-[#10B981]" />;
    if (model.includes('Claude')) return <SiAnthropic className="w-3.5 h-3.5 text-[#D3A982]" />;
    return <img src="./DispatcherIcon.png" alt="" className="w-4 h-4 object-contain" />;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) setShowModelDropdown(false);
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(target)) setShowAgentDropdown(false);
      if (plusDropdownRef.current && !plusDropdownRef.current.contains(target)) setShowPlusDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const openModelPicker = () => setShowModelDropdown(true);
    window.addEventListener('open-model-picker', openModelPicker);
    return () => window.removeEventListener('open-model-picker', openModelPicker);
  }, []);

  useEffect(() => {
    if (!userId) {
      setTokenQuota(null);
      return;
    }

    let cancelled = false;
    const refreshQuota = async () => {
      try {
        const quota = await fetchTokenQuota(userId);
        if (!cancelled) setTokenQuota(quota);
      } catch {
        if (!cancelled) setTokenQuota(null);
      }
    };

    void refreshQuota();
    window.addEventListener('token-quota-updated', refreshQuota);
    return () => {
      cancelled = true;
      window.removeEventListener('token-quota-updated', refreshQuota);
    };
  }, [userId]);

  // Update position when hovered category changes
  useEffect(() => {
    if (hoveredCategory && modelItemRefs.current[hoveredCategory]) {
      const rect = modelItemRefs.current[hoveredCategory].getBoundingClientRect();
      setHoveredCategoryPosition({ top: rect.top, left: rect.right });
    } else {
      setHoveredCategoryPosition(null);
    }
  }, [hoveredCategory]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(Math.max(textareaRef.current.scrollHeight, 40), 200) + 'px';
    }
  }, [content]);

  const handleSend = () => {
    if (content.trim() || selectedImages.length > 0) {
      onSend(
        content.trim(),
        selectedImages.length > 0 ? selectedImages.map(img => ({
          name: img.file.name,
          path: img.file.name,
          content: img.url,
          sizeBytes: img.file.size
        })) : undefined,
        mentionedFiles
      );
      setContent('');
      setMentionedFiles([]);
      setSelectedImages([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const updateConfig = (partial: Partial<AIConfig>) => {
    setAIConfig(partial, undefined);
    if (onConfigChange) {
      onConfigChange(partial);
    }
  };

  const quotaTarget = getQuotaTarget(config.model || 'Dispatcher v1');
  const quotaRemaining = tokenQuota?.[quotaTarget];
  const quotaMaximum = quotaTarget === 'token_remaining' ? tokenQuota?.max_token : tokenQuota?.other_ai_max;
  const quotaPercentage = quotaRemaining !== undefined && quotaMaximum && quotaMaximum > 0
    ? Math.min(Math.max((quotaRemaining / quotaMaximum) * 100, 0), 100)
    : null;
  const quotaWarning = quotaPercentage !== null && quotaPercentage <= 20
    ? {
        color: quotaPercentage <= 10 ? 'text-red-400' : 'text-amber-400',
        label: quotaPercentage <= 10
          ? `Your quota for this model is critically low (${Math.round(quotaPercentage)}% remaining).`
          : `Your quota for this model is running low (${Math.round(quotaPercentage)}% remaining).`,
      }
    : null;

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
        {selectedImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {selectedImages.map((img, i) => (
              <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 cursor-pointer" onClick={() => setPreviewImage(img.url)}>
                <img src={img.url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImages(prev => prev.filter((_, idx) => idx !== i));
                  }}
                  className="absolute top-1 right-1 w-4 h-4 bg-black/60 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(e) => {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                  e.preventDefault();
                  handleImageUpload(file);
                }
              }
            }
          }}
          placeholder="Ask anything, @ to mention, / for actions"
          className="w-full bg-transparent resize-none outline-none text-[#e2e2e3] text-[14px] placeholder-[#6b6b73] custom-scrollbar min-h-[40px] max-h-[200px]"
          rows={1}
        />

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <div className="relative" ref={plusDropdownRef}>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => setShowPlusDropdown(!showPlusDropdown)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#8b8b93] hover:text-white hover:bg-white/5 transition-colors"
              >
                <Plus size={16} />
              </button>
              <AnimatePresence>
                {showPlusDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2 w-48 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                  >
                    <button
                      className="w-full px-3 py-2 text-left text-xs text-[#a8a8b1] hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                      onClick={() => {
                        setShowPlusDropdown(false);
                        fileInputRef.current?.click();
                      }}
                    >
                      <ImageIcon size={14} />
                      <span className="font-medium">Media</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" ref={agentDropdownRef}>
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className={cn(
                  "flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-all",
                  config.interactionMode === 'plan' ? "text-amber-300 bg-amber-500/15 border border-amber-500/30" : config.agentMode
                    ? "text-purple-300 bg-purple-500/15 border border-purple-500/30"
                    : "text-[#8b8b93] hover:text-white bg-white/5 border border-transparent"
                )}
              >
                {config.interactionMode === 'plan' ? <ClipboardList size={14} className="text-white" /> : config.agentMode ? <Bot size={14} className="text-white" /> : <Mic size={14} />}
                <span className={cn(config.agentMode || config.interactionMode === 'plan' ? "text-white font-bold tracking-wide" : "")}>
                  {config.interactionMode === 'plan' ? 'Plan' : config.agentMode ? 'Agent' : 'Ask'}
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
                    className="absolute bottom-full left-0 mb-2 w-56 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl py-1 z-50 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        updateConfig({ agentMode: true, interactionMode: 'agent' });
                        setShowAgentDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs transition-colors",
                        config.interactionMode === 'agent' ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Bot size={14} />
                        <span className="font-medium">Agent</span>
                      </div>
                      <div className="text-[10px] text-white/50 pl-6">Full agentic coding with tools</div>
                    </button>
                    <button
                      onClick={() => {
                        updateConfig({ agentMode: true, interactionMode: 'plan' });
                        setShowAgentDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs transition-colors",
                        config.interactionMode === 'plan' ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1"><ClipboardList size={14} /><span className="font-medium">Plan</span></div>
                      <div className="text-[10px] text-white/50 pl-6">Inspect the project and maintain one reviewed plan</div>
                    </button>
                    <button
                      onClick={() => {
                        updateConfig({ agentMode: false, interactionMode: 'ask' });
                        setShowAgentDropdown(false);
                      }}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs transition-colors",
                        config.interactionMode === 'ask' ? "text-white bg-white/5" : "text-[#a8a8b1] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Mic size={14} />
                        <span className="font-medium">Ask</span>
                      </div>
                      <div className="text-[10px] text-white/50 pl-6">Simple Q&A and assistance</div>
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
                {getModelIcon(config.model || 'Dispatcher v1')}
                <span className="font-medium text-white">{config.model || 'Dispatcher v1'}</span>
                {quotaWarning && (
                  <span className="group/quota relative flex shrink-0 items-center" aria-label={quotaWarning.label}>
                    <Gauge size={13} className={quotaWarning.color} />
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#252529] px-2.5 py-1.5 text-[10px] font-normal text-white opacity-0 shadow-xl transition-opacity group-hover/quota:opacity-100"
                    >
                      {quotaWarning.label}
                    </span>
                  </span>
                )}
                <ChevronDown size={12} className={cn("transition-transform duration-200 opacity-60", showModelDropdown ? "rotate-180" : "")} />
              </button>
              <AnimatePresence>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute bottom-full left-0 mb-2 w-56 bg-[#0f0f13] border border-white/10 rounded-lg shadow-xl z-50 overflow-visible flex flex-col h-[320px]"
                  >
                    {/* Search Input */}
                    <div className="px-2 pb-2 mt-2 flex-shrink-0">
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

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {filteredModels.map((model) => (
                        <div
                          key={model.id}
                          className="relative w-full"
                          ref={(el) => {
                            if (el) {
                              modelItemRefs.current[model.id] = el;
                            }
                          }}
                          onMouseEnter={() => setHoveredCategory(model.id)}
                        >
                          {model.submodels.length > 0 ? (
                            <>
                              <button disabled={model.isPro} className={cn("w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors", hoveredCategory === model.id ? "bg-white/10 text-white" : "text-[#a8a8b1]", model.isPro ? "opacity-50 cursor-not-allowed" : "hover:text-white hover:bg-white/5")}>
                                <span className="flex items-center gap-2">
                                  {model.icon}
                                  {model.name}
                                  {model.isPro && <span className="text-[8px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded font-medium">PRO+</span>}
                                </span>
                                <ChevronRight size={12} />
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={model.isPro}
                              onClick={() => { if(!model.isPro) { updateConfig({ model: model.name }); setShowModelDropdown(false); } }}
                              className={cn("w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors", model.isPro ? "opacity-50 cursor-not-allowed text-[#a8a8b1]" : "text-[#a8a8b1] hover:text-white hover:bg-white/5")}
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
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Portal for submodel dropdown and tooltips */}
              {showModelDropdown && hoveredCategory && hoveredCategoryPosition && (() => {
                const model = allModels.find(m => m.id === hoveredCategory);
                if (!model) return null;
                
                if (model.isPro) {
                  return createPortal(
                    <AnimatePresence>
                      <motion.div
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          position: 'fixed',
                          top: hoveredCategoryPosition.top + 2,
                          left: hoveredCategoryPosition.left + 8,
                          zIndex: 9999,
                        }}
                        className="px-3 py-1.5 bg-[#1f2937] text-white text-xs rounded whitespace-nowrap shadow-xl border border-white/5"
                      >
                        Upgrade your plan to Pro+
                      </motion.div>
                    </AnimatePresence>,
                    document.body
                  );
                }

                if (model.submodels.length === 0) return null;
                return createPortal(
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'fixed',
                        top: hoveredCategoryPosition.top,
                        left: hoveredCategoryPosition.left + 4,
                        zIndex: 9999,
                      }}
                      className="w-32 bg-[#16161a] border border-white/10 rounded-lg shadow-xl py-1 flex flex-col"
                    >
                      {model.submodels.map(m => (
                        <button
                          key={m}
                          onClick={() => { updateConfig({ model: model.id === 'gpt-oss' ? `GPT-OSS ${m}` : model.id === 'qwen' ? `Qwen 3.7 ${m}` : model.id === 'gpt56' ? `GPT-5.6 ${m}` : model.id === 'deepseek' ? `DeepSeek v4 ${m}` : model.id === 'glm' ? `GLM ${m}` : m }); setShowModelDropdown(false); }}
                          className="px-3 py-1.5 text-xs text-left text-[#a8a8b1] hover:text-white hover:bg-white/10"
                        >
                          {m}
                        </button>
                      ))}
                    </motion.div>
                  </AnimatePresence>,
                  document.body
                );
              })()}
            </div>

          </div>

          <div className="flex items-center gap-2">
            <TokenCircleIndicator budget={tokenBudget || { 
              total: 128000, utilizationPercent: 0, available: 128000, 
              systemPrompt: 0, tools: 0, projectContext: 0, conversationHistory: 0, responseReserved: 0 
            }} />
            {isAgentRunning ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <div className="relative group">
                  {!hasProject && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      Choose a project first
                    </div>
                  )}
                <button
                  onClick={() => {
                    if ((content.trim() || selectedImages.length > 0) && hasProject) {
                      handleSend();
                    }
                  }}
                  disabled={!hasProject}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    !hasProject
                      ? "bg-gray-600 text-gray-400 cursor-not-allowed opacity-50"
                      : (content.trim().length > 0 || selectedImages.length > 0)
                      ? "bg-[#007acc] hover:bg-[#0088dd] text-white shadow-lg"
                      : "bg-white/5 hover:bg-white/10 text-[#8b8b93] hover:text-white"
                  )}
                >
                  {(content.trim().length > 0 || selectedImages.length > 0) && hasProject ? <Send size={14} /> : <Mic size={14} />}
                </button>
                </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative flex flex-col items-center bg-[#0f0f13] border border-white/10 rounded-2xl shadow-2xl w-fit h-fit min-w-[350px] max-w-[90vw] max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="w-full flex justify-end gap-3 p-4 pb-0 z-20">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      // We must pass a Promise directly to ClipboardItem to preserve the user gesture context
                      const blobPromise = fetch(previewImage)
                        .then(res => res.blob())
                        .then(blob => {
                          if (blob.type === 'image/png') return blob;
                          return new Promise<Blob>((resolve, reject) => {
                            const img = new Image();
                            img.crossOrigin = 'anonymous';
                            img.onload = () => {
                              const canvas = document.createElement('canvas');
                              canvas.width = img.width;
                              canvas.height = img.height;
                              const ctx = canvas.getContext('2d');
                              ctx?.drawImage(img, 0, 0);
                              canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas failed')), 'image/png');
                            };
                            img.onerror = () => reject(new Error('Image load failed'));
                            img.src = previewImage;
                          });
                        });
                      
                      await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blobPromise })
                      ]);
                      setIsImageCopied(true);
                      setTimeout(() => setIsImageCopied(false), 2000);
                    } catch (err: any) {
                      alert('Failed to copy image: ' + (err?.message || err));
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/10 transition-colors shadow-sm w-32 justify-center"
                >
                  {isImageCopied ? (
                    <>
                      <Check size={14} className="text-green-400" />
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy Image
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const a = document.createElement('a');
                    a.href = previewImage;
                    a.download = 'image.png';
                    a.click();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/10 transition-colors shadow-sm"
                >
                  <Download size={14} />
                  Download Image
                </button>
              </div>
              <div className="w-full flex-1 flex items-center justify-center p-6 pt-4 min-h-0">
                <img src={previewImage} alt="Preview" className="max-w-full max-h-[calc(90vh-80px)] object-contain rounded-lg shadow-xl" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

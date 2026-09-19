import { renderToString } from 'react-dom/server';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createModel, Model, KaldiRecognizer } from 'vosk-browser';
import { createPortal } from 'react-dom';
import { AIConfig, setAIConfig } from '../../lib/aiConfig';
import { FileAttachment } from '../../lib/messageTypes';
import { Minus, Bot, Paperclip, ArrowUp, Square, ChevronDown, ChevronRight, HardDrive, Cloud, Send, Mic, Network, Zap, Brain, Sparkles, Search, Gauge, Plus, Image as ImageIcon, X, Copy, Download, ClipboardList, Check, Link2, Mail, PenLine, Trash2, Folder, FileText, Upload } from 'lucide-react';
import { SiAnthropic, SiAlibabacloud, SiGmail, SiGoogledrive, SiGithub, SiSupabase } from 'react-icons/si';
import { motion, AnimatePresence } from 'framer-motion';
import { FileContextBadge } from './FileContextBadge';
import { OpenAIIcon } from '../icons/OpenAIIcon';
import { fetchTokenQuota, getQuotaTarget, TokenQuotaSnapshot } from '../../lib/tokenQuota';
import { TokenBudget } from '../../lib/tokenCounter';
import { Tooltip } from '../ui/Tooltip';
import { getInstalledSkills, AgentSkill } from '../../lib/agentSkills';
import { getAllTools } from '../../lib/tools';
import { Puzzle, Globe, Database } from 'lucide-react';
import Strands from '../Strands';
import Orb from '../ui/Orb';
import BorderGlow from '../ui/BorderGlow';

const autoCorrectCodeJargon = (text: string): string => {
  if (!text) return text;
  
  let fixed = text
    .replace(/\buse effect\b/gi, 'useEffect')
    .replace(/\buse state\b/gi, 'useState')
    .replace(/\buse ref\b/gi, 'useRef')
    .replace(/\buse memo\b/gi, 'useMemo')
    .replace(/\buse callback\b/gi, 'useCallback')
    .replace(/\buse context\b/gi, 'useContext')
    .replace(/\breact\b/gi, 'React')
    .replace(/\btype script\b/gi, 'TypeScript')
    .replace(/\bjava script\b/gi, 'JavaScript')
    .replace(/\bnode js\b/gi, 'Node.js')
    .replace(/\bnext js\b/gi, 'Next.js')
    .replace(/\bconsole log\b/gi, 'console.log')
    .replace(/\bconsole dot log\b/gi, 'console.log')
    .replace(/\btail wind\b/gi, 'Tailwind')
    .replace(/\bget hub\b/gi, 'GitHub')
    .replace(/\bcss\b/g, 'CSS')
    .replace(/\bhtml\b/g, 'HTML')
    .replace(/\bapi\b/g, 'API')
    .replace(/\bjson\b/g, 'JSON')
    .replace(/\burl\b/g, 'URL')
    .replace(/\bhttp\b/g, 'HTTP')
    .replace(/\bui\b/g, 'UI')
    .replace(/\bux\b/g, 'UX');
  
  return fixed;
};

const MinimaxIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14v-4c0-1.1.9-2 2-2s2 .9 2 2v6c0 1.1.9 2 2 2s2-.9 2-2V8c0-1.1.9-2 2-2s2 .9 2 2v8c0 1.1.9 2 2 2s2-.9 2-2v-6" />
  </svg>
);
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
  hasMessages?: boolean;
}

const MCP_ALIASES = [
  { trigger: '@shadcn', id: 'shadcn', name: 'Shadcn UI', icon: './shadcn.png', desc: 'Browse and install React components' },
  { trigger: '@github', id: 'github', name: 'GitHub', icon: './github.png', desc: 'Manage repositories and pull requests' },
  { trigger: '@vercel', id: 'vercel', name: 'Vercel', icon: './vercel.png', desc: 'Manage deployments and view build logs' },
    { trigger: '@figma', id: 'figma', name: 'Figma', icon: './figma.png', desc: 'Extract CSS and read design tokens' },
  { trigger: '@drive', id: 'gdrive', name: 'Drive', icon: './drive.png', desc: 'Search and read Google Drive files' },
  { trigger: '@supabase', id: 'supabase', name: 'Supabase', icon: './supabase.png', desc: 'Query and manage your database' },
  { trigger: '@gmail', id: 'gmail', name: 'Gmail', icon: './gmail.png', desc: 'Search inbox and draft emails' },
  { trigger: '@web', id: 'playwright', name: 'Web', icon: './browser.png', desc: 'Web browsing and automation' },
  { trigger: '@google drive', id: 'gdrive', name: 'Drive', icon: './drive.png', desc: '', hidden: true },
  { trigger: '@mail', id: 'gmail', name: 'Gmail', icon: './gmail.png', desc: '', hidden: true },
  { trigger: '@browser', id: 'playwright', name: 'Web', icon: './browser.png', desc: '', hidden: true }
];

export function PromptInput({ onSend, onStop, isAgentRunning, config, projectFiles, onConfigChange, value, onChange, hasProject = true, userId, tokenBudget, hasMessages = false }: PromptInputProps) {
  const [localContent, setLocalContent] = useState('');
  const content = value !== undefined ? value : localContent;
  const setContent = onChange || setLocalContent;

  useEffect(() => {
    if (textareaRef.current && content !== undefined) {
      let currentDomText = '';
      for (const child of Array.from(textareaRef.current.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          currentDomText += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          if (el.dataset && el.dataset.trigger) {
            currentDomText += el.dataset.trigger;
          } else {
            currentDomText += el.innerText || el.textContent;
          }
        }
      }
      
      if (currentDomText !== content) {
          textareaRef.current.innerHTML = '';
          const aliases = [...getActiveAliases()].sort((a, b) => b.trigger.length - a.trigger.length);
          // Simplified regex for manual replace
          const triggerRegex = new RegExp(`(^|\\s)(${aliases.map(a => a.trigger).join('|').replace(/ /g, '\\s')})(?=\\s|$)`, 'gi');
          
          let lastIndex = 0;
          let match;
          
          while ((match = triggerRegex.exec(content)) !== null) {
              if (match.index > lastIndex) {
                  const pre = content.substring(lastIndex, match.index);
                  // add the space from the match group if it exists
                  textareaRef.current.appendChild(document.createTextNode(pre + match[1])); 
              } else if (match[1]) {
                  textareaRef.current.appendChild(document.createTextNode(match[1])); 
              }
              
              const trigger = match[2];
              const alias = aliases.find(a => a.trigger.toLowerCase() === trigger.toLowerCase());
              
              if (alias) {
                  const chip = document.createElement('span');
                  chip.contentEditable = 'false';
                  chip.className = 'inline-flex items-center gap-1.5 px-1 py-0.5 mx-1 text-[14px] align-middle select-none bg-transparent';
                  chip.dataset.mcp = alias.id;
                  chip.dataset.mcpName = alias.name;
                  chip.dataset.trigger = alias.trigger;
                  chip.innerHTML = `<img src="${alias.icon}" alt="${alias.name}" class="w-4 h-4 object-contain inline-block ${(alias.id === 'github' || alias.id === 'vercel') ? 'filter invert opacity-90' : ''}" /><span class="text-[#4b93ff] font-medium">${alias.name}</span>`;
                  textareaRef.current.appendChild(chip);
                  textareaRef.current.appendChild(document.createTextNode('\u00A0'));
              } else {
                  textareaRef.current.appendChild(document.createTextNode(trigger));
              }
              lastIndex = match.index + match[0].length;
          }
          if (lastIndex < content.length) {
              textareaRef.current.appendChild(document.createTextNode(content.substring(lastIndex)));
          }
      }
    }
  }, [content]);
  const [mentionedFiles, setMentionedFiles] = useState<string[]>([]);
  const textareaRef = useRef<HTMLDivElement>(null);
  const textBeforeListening = useRef<string>('');
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [selectedImages, setSelectedImages] = useState<{ url: string; file: File }[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isImageCopied, setIsImageCopied] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showMicModal, setShowMicModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveEmail, setGdriveEmail] = useState<string | null>(null);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [figmaConnected, setFigmaConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);

  const connectors = [
    {
      id: 'gmail',
      name: 'Gmail',
      desc: 'Draft replies, search your inbox, and summarize email threads instantly',
      icon: './gmail.png',
      connected: gmailConnected,
      onConnect: async () => {
        try {
          
            if (userId) {
              try {
                const credsRes = await fetch('https://api.devctr.com/api/credentials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: userId })
                });
                if (credsRes.ok) {
                  const credentials = await credsRes.json();
                  await fetch('http://localhost:3001/set-credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId: credentials.Public, clientSecret: credentials.Public_key })
                  });
                }
              } catch(err) { console.error("Failed to dynamically set Gmail credentials:", err); }
            }
            const res = await fetch('http://localhost:3001/auth/url');
          const data = await res.json();
          if ((window as any).electron?.openExternal) {
            (window as any).electron.openExternal(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        } catch (e) {
          alert('GMail MCP Server is not running yet. Please restart Quantix.');
        }
      },
      onDisconnect: async () => {
        try {
          await fetch('http://localhost:3001/auth/disconnect', { method: 'POST' });
          setGmailConnected(false);
        } catch (e) {
          alert('Failed to disconnect GMail.');
        }
      }
    },
    {
      id: 'gdrive',
      name: 'Google Drive',
      desc: 'Access your files, search instantly, and manage your documents',
      icon: './drive.png',
      connected: gdriveConnected,
      onConnect: async () => {
        try {
          
            if (userId) {
              try {
                const credsRes = await fetch('https://api.devctr.com/api/credentials', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: userId })
                });
                if (credsRes.ok) {
                  const credentials = await credsRes.json();
                  await fetch('http://localhost:3002/set-credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId: credentials.Public, clientSecret: credentials.Public_key })
                  });
                }
              } catch(err) { console.error("Failed to dynamically set GDrive credentials:", err); }
            }
            const res = await fetch('http://localhost:3002/auth/url');
          const data = await res.json();
          if ((window as any).electron?.openExternal) {
            (window as any).electron.openExternal(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        } catch (e) {
          alert('Google Drive MCP Server is not running yet. Please restart Quantix.');
        }
      },
      onDisconnect: async () => {
        try {
          await fetch('http://localhost:3002/auth/disconnect', { method: 'POST' });
          setGdriveConnected(false);
        } catch (e) {
          alert('Failed to disconnect Google Drive.');
        }
      }
    },
          {
        id: 'github',
        name: 'GitHub',
        desc: 'Manage repositories, track code changes, and collaborate on team projects',
        icon: './github.png',
        opacity: 'opacity-90',
        connected: githubConnected,
        onConnect: async () => {
          try {
            const res = await fetch('http://localhost:3005/auth/url');
            const data = await res.json();
            if (window.electron?.openExternal) {
              window.electron.openExternal(data.url);
            } else {
              window.open(data.url, '_blank');
            }
          } catch (e) {
            alert('GitHub MCP Server is not running yet. Please restart Quantix.');
          }
        },
        onDisconnect: async () => {
          try {
            await fetch('http://localhost:3005/auth/disconnect', { method: 'POST' });
            setGithubConnected(false);
          } catch (e) {
            alert('Failed to disconnect GitHub.');
          }
        }
      },

    {
      id: 'supabase',
      name: 'Supabase',
      desc: 'Query your database, view tables, and manage your schema',
      icon: './supabase.png',
      connected: supabaseConnected,
      onConnect: async () => {
        try {
          const res = await fetch('http://localhost:3003/auth/url');
          const data = await res.json();
          if ((window as any).electron?.openExternal) {
            (window as any).electron.openExternal(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        } catch (e) {
          alert('Supabase MCP Server is not running yet. Please restart Quantix.');
        }
      },
      onDisconnect: async () => {
        try {
          await fetch('http://localhost:3003/auth/disconnect', { method: 'POST' });
          setSupabaseConnected(false);
        } catch (e) {
          alert('Failed to disconnect Supabase.');
        }
      }
    },
    {
      id: 'vercel',
      name: 'Vercel',
      desc: 'Deploy your projects, manage domains and check build logs',
      icon: './vercel.png',
      connected: vercelConnected,
      onConnect: async () => {
        try {
          const res = await fetch('http://localhost:3006/auth/url');
          const data = await res.json();
          if ((window as any).electron?.openExternal) {
            (window as any).electron.openExternal(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        } catch (e) {
          alert('Vercel MCP Server is not running yet. Please restart Quantix.');
        }
      },
      onDisconnect: async () => {
        try {
          await fetch('http://localhost:3006/auth/disconnect', { method: 'POST' });
          setVercelConnected(false); } catch (e) { alert('Failed to disconnect Vercel.'); } } }, { id: 'shadcn', name: 'Shadcn UI', desc: 'Browse, search, and install React components using natural language', icon: './shadcn.png', connected: true },
    {
      id: 'figma',
      name: 'Figma',
      desc: 'Extract CSS, read design tokens and get asset details',
      icon: './figma.png',
      connected: figmaConnected,
      onConnect: async () => {
        try {
          const res = await fetch('http://localhost:3004/auth/url');
          const data = await res.json();
          if ((window as any).electron?.openExternal) {
            (window as any).electron.openExternal(data.url);
          } else {
            window.open(data.url, '_blank');
          }
        } catch (e) {
          alert('Figma MCP Server is not running yet. Please restart Quantix.');
        }
      },
      onDisconnect: async () => {
        try {
          await fetch('http://localhost:3004/auth/disconnect', { method: 'POST' });
          setFigmaConnected(false);
        } catch (e) {
          alert('Failed to disconnect Figma.');
        }
      }
    }
  ];

  const filteredConnectors = connectors.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.desc.toLowerCase().includes(searchQuery.toLowerCase()));

  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredCategoryPosition, setHoveredCategoryPosition] = useState<{ top: number; left: number; right: number; bottom: number; width: number } | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [tokenQuota, setTokenQuota] = useState<TokenQuotaSnapshot | null>(null);
  const modelItemRefs = useRef<Record<string, HTMLDivElement>>({});

  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashSearchQuery, setSlashSearchQuery] = useState('');
  const [availableSkills, setAvailableSkills] = useState<AgentSkill[]>([]);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [slashMenuPos, setSlashMenuPos] = useState(0);
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atSearchQuery, setAtSearchQuery] = useState('');
  const [atSelectedIndex, setAtSelectedIndex] = useState(0);
  const [atMenuPos, setAtMenuPos] = useState(0);



  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [selectedSlashCommands, setSelectedSlashCommands] = useState<any[]>([]);
  const slashMenuRef = useRef<HTMLDivElement>(null);

  const chipsContainerRef = useRef<HTMLDivElement>(null);
  const [chipsWidth, setChipsWidth] = useState(0);

  useEffect(() => {
    if (chipsContainerRef.current) {
      setChipsWidth(chipsContainerRef.current.offsetWidth);
    } else {
      setChipsWidth(0);
    }
  }, [selectedSlashCommands]);

  // Check GDrive connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3002/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setGdriveConnected(data.connected === true);
        setGdriveEmail(data.email || null);

        // If modal is open, poll fast. Otherwise, poll slow.
        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        // Server not running yet. 
        // If we are in the first 10 seconds (attempts < 10), retry quickly.
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);

  // Check Supabase connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3003/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setSupabaseConnected(data.connected === true);

        // If modal is open, poll fast. Otherwise, poll slow.
        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        // Server not running yet. 
        // If we are in the first 10 seconds (attempts < 10), retry quickly.
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);

  // Check Figma connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3004/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setFigmaConnected(data.connected === true);

        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);

  // Check Vercel connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3006/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setVercelConnected(data.connected === true);

        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);

  // Check GitHub connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3005/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setGithubConnected(prev => {
          if (!prev && data.connected === true) {
            window.electron?.ipcRenderer?.invoke('mcp-reconnect-server', 'github').catch(() => {});
          }
          return data.connected === true;
        });

        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);

  // Check GMail connection status on load and poll while modal is open
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;
    let attempts = 0;

    const check = async () => {
      try {
        const res = await fetch('http://localhost:3001/auth/status');
        if (!isMounted) return;
        const data = await res.json();
        setGmailConnected(data.connected === true);
        setGmailEmail(data.email || null);

        // If modal is open, poll fast. Otherwise, poll slow.
        timeoutId = setTimeout(check, showConnectModal ? 2000 : 10000);
      } catch {
        if (!isMounted) return;
        // Server not running yet. 
        // If we are in the first 10 seconds (attempts < 10), retry quickly.
        attempts++;
        timeoutId = setTimeout(check, attempts < 10 ? 1000 : 10000);
      }
    };

    void check();
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [showConnectModal]);





  const voskModel = useRef<Model | null>(null);
  const voskRecognizer = useRef<KaldiRecognizer | null>(null);
  const voskReady = useRef(false);
  const isTranscribing = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const initVosk = async () => {
      try {
        console.log("Loading Vosk model...");
        const model = await createModel('/models/vosk-model-v2.tar.gz');
        if (!isMounted) return;
        voskModel.current = model;
        
        const recognizer = new model.KaldiRecognizer(16000);
        recognizer.setWords(true);
        
        recognizer.on("result", (message: any) => {
          console.log("Got result:", message);
          const text = autoCorrectCodeJargon(message.result.text);
          if (text) {
            const base = textBeforeListening.current;
            const space = (base && !base.endsWith(' ') && !text.startsWith(' ') ? ' ' : '');
            const newText = base + space + text;
            if (textareaRef.current) {
              textareaRef.current.innerText = newText;
              setContent(newText);
            }
          }
        });
        
        recognizer.on("partialresult", (message: any) => {
          console.log("Got partial:", message);
          const partial = autoCorrectCodeJargon(message.result.partial);
          if (partial) {
            const base = textBeforeListening.current;
            const space = (base && !base.endsWith(' ') && !partial.startsWith(' ') ? ' ' : '');
            const newText = base + space + partial + "...";
            if (textareaRef.current) {
              textareaRef.current.innerText = newText;
              setContent(newText);
            }
          }
        });
        
        voskRecognizer.current = recognizer;
        voskReady.current = true;
        console.log("Vosk is READY!");
      } catch (e) {
        console.error("Vosk init failed", e);
      }
    };
    initVosk();
    
    return () => {
      isMounted = false;
      if (voskRecognizer.current) {
        voskRecognizer.current.remove();
      }
      if (voskModel.current) {
        voskModel.current.terminate();
      }
    };
  }, []);

useEffect(() => {
    if (!isListening || !micStream) return;

    let audioCtx: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let gainNode: GainNode | null = null;
    
    let audioData = new Float32Array(0);

    try {
      // Use native WebAudio resampler by specifying sampleRate: 16000
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      source = audioCtx.createMediaStreamSource(micStream);
      
      // Create AnalyserNode for Orb
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      processor = audioCtx.createScriptProcessor(4096, 1, 1); 
      
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // mute output so user doesn't hear themselves

      // Stream to Vosk immediately
      processor.onaudioprocess = (e) => {
        if (!voskReady.current || !voskRecognizer.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        voskRecognizer.current.acceptWaveformFloat(inputData, 16000);
      };

      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    } catch (err) {
      console.error("PCM recording setup failed", err);
    }

    return () => {
      if (processor && source && gainNode) {
        source.disconnect();
        processor.disconnect();
        gainNode.disconnect();
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch((e: any) => console.error(e));
      }
    };
  }, [isListening, micStream]);


  useEffect(() => {
    let mounted = true;
    const loadItems = async () => {
      try {
        const skills = await getInstalledSkills('');
        if (mounted) setAvailableSkills(skills);
      } catch (err) {
        console.error(err);
      }
      if (mounted) setAvailableTools(getAllTools());
    };
    loadItems();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (value) {
      const prefixMatch = value.match(/^((?:use [\w-]+(?: skill)?)(?:(?:, |\s+)use [\w-]+(?: skill)?)*)(?:\n\n|\n|$)/);
      if (prefixMatch) {
        const fullPrefix = prefixMatch[1];
        const pieces: string[] = fullPrefix.match(/use [\w-]+(?: skill)?/g) || [];

        const newSelected: any[] = [];
        pieces.forEach(p => {
          if (p.endsWith(' skill')) {
            const name = p.replace(/^use /, '').replace(/ skill$/, '');
            newSelected.push({ id: `skill-${name}`, type: 'skill', name: name, displayName: name, icon: <Puzzle size={14} className="text-orange-400" /> });
          } else {
            const name = p.replace(/^use /, '');
            const displayName = name === 'playwright' || name === 'mcp__playwright' ? 'Browser' : name.replace('mcp__', '').replace(/__/g, ' ');
            newSelected.push({ id: name, type: 'tool', name: name, displayName: displayName, icon: name === 'playwright' || name === 'mcp__playwright' ? <Globe size={14} className="text-blue-400" /> : <Puzzle size={14} className="text-purple-400" /> });
          }
        });

        setSelectedSlashCommands(newSelected);
        if (onChange) {
          onChange(value.slice(prefixMatch[0].length));
        } else {
          setLocalContent(value.slice(prefixMatch[0].length));
        }
      }
    }
  }, [value, onChange]);

  
  const getActiveAliases = () => {
    return MCP_ALIASES.filter(a => {
      if (a.id === 'figma') return figmaConnected;
      if (a.id === 'gdrive') return gdriveConnected;
      if (a.id === 'gmail') return gmailConnected;
      if (a.id === 'supabase') return supabaseConnected;
      if (a.id === 'github') return githubConnected;
        if (a.id === 'vercel') return vercelConnected;
      return true;
    });
  };

  const atItems = getActiveAliases()
    .filter((a: any) => !a.hidden)
    .filter((a: any) => a.trigger.toLowerCase().includes(atSearchQuery.toLowerCase()) || a.name.toLowerCase().includes(atSearchQuery.toLowerCase()));

  const insertAtItem = (item: any) => {
    if (!textareaRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const cursor = selection.getRangeAt(0).startOffset;
    const textBefore = textareaRef.current.textContent || '';
    
    const match = textBefore.match(/@([\w-]*)$/);
    if (match) {
      const matchLength = match[0].length;
      
      const range = selection.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, Math.max(0, cursor - matchLength));
        range.deleteContents();
        
        const chip = document.createElement('span');
        chip.contentEditable = 'false';
        chip.className = 'inline-flex items-center gap-1.5 px-1 py-0.5 mx-1 text-[14px] align-middle select-none bg-transparent';
        chip.dataset.mcp = item.id;
        chip.dataset.mcpName = item.name;
        chip.dataset.trigger = item.trigger;
        chip.innerHTML = `<img src="${item.icon}" alt="${item.name}" class="w-4 h-4 object-contain ${(item.id === 'github' || item.id === 'vercel') ? 'filter invert opacity-90' : ''}" /><span class="text-[#4b93ff] font-medium">${item.name}</span>`;
        
        const spaceNode = document.createTextNode('\u00A0');
        range.insertNode(spaceNode);
        range.insertNode(chip);
        
        range.setStartAfter(spaceNode);
        range.setEndAfter(spaceNode);
        selection.removeAllRanges();
        selection.addRange(range);
        
        setShowAtMenu(false);
        const event = new Event('input', { bubbles: true });
        textareaRef.current.dispatchEvent(event);
      }
    }
  };

  const slashItems = [
    // Map Playwright as Browser
    ...(availableTools.some(t => t.definition.category === 'mcp' && t.definition.name.startsWith('mcp__playwright'))
      ? [{ id: 'browser', type: 'tool', name: 'playwright', displayName: 'Browser', description: 'Web browsing and automation via Playwright', icon: <Globe size={14} className="text-blue-400" /> }]
      : []),
    ...availableTools
      .filter(t => t.definition.category === 'mcp' && !t.definition.name.startsWith('mcp__playwright'))
      .map(t => ({
        id: t.definition.name,
        type: 'tool',
        name: t.definition.name.replace('mcp__', '').replace(/__/g, ' '),
        displayName: t.definition.name.replace('mcp__', '').replace(/__/g, ' '),
        description: t.definition.description || '',
        icon: <Puzzle size={14} className="text-purple-400" />
      })),
    ...availableSkills
      .map(s => ({
        id: `skill-${s.name}`,
        type: 'skill',
        name: s.name,
        displayName: s.name,
        description: s.description,
        icon: <Puzzle size={14} className="text-orange-400" />
      }))
  ].filter(item => item.displayName.toLowerCase().includes(slashSearchQuery.toLowerCase()) || item.name.toLowerCase().includes(slashSearchQuery.toLowerCase()));

  const allModels = [
    { id: 'dispatcher', name: 'Dispatcher v1', icon: <img src="./DispatcherIcon.png" alt="" className="w-3.5 h-3.5 object-contain" />, submodels: [], isPro: false },
    { id: 'minimax', name: 'Minimax M3', icon: <MinimaxIcon className="w-3.5 h-3.5 text-[#F24E1E]" />, submodels: [], isPro: false },
    { id: 'qwen', name: 'Qwen 3.7', icon: <QwenIcon className="w-3.5 h-3.5 text-[#FF6A00]" />, submodels: ['Flash', 'Plus', 'Max'], isPro: true },
    { id: 'qwen38', name: 'Qwen 3.8', icon: <QwenIcon className="w-3.5 h-3.5 text-[#623AE7]" />, submodels: [], isPro: true },
    { id: 'gpt56', name: 'GPT-5.6', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: ['Luna', 'Terra', 'Sol'], isPro: true },
    { id: 'gpt6astra', name: 'GPT-6 Astra', icon: <OpenAIIcon className="w-3.5 h-3.5 text-white" />, submodels: [], isPro: true },
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
    if (model.includes('GPT-5.6')) return <OpenAIIcon className="w-3.5 h-3.5 text-white" />;
    if (model.includes('Qwen')) return <QwenIcon className="w-4 h-4 text-[#FF6A00]" />;
    if (model.includes('DeepSeek')) return <DeepSeekIcon className="w-3.5 h-3.5 text-[#4D6BFE]" />;
    if (model.includes('Kimi')) return <KimiIcon className="w-3.5 h-3.5 text-[#6366F1]" />;
    if (model.includes('GLM')) return <GLMIcon className="w-3.5 h-3.5 text-[#10B981]" />;
    if (model.includes('Claude')) return <SiAnthropic className="w-3.5 h-3.5 text-[#D3A982]" />;
    if (model.includes('Minimax')) return <MinimaxIcon className="w-3.5 h-3.5 text-[#F24E1E]" />;
    return <img src="./DispatcherIcon.png" alt="" className="w-4 h-4 object-contain" />;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) setShowModelDropdown(false);
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(target)) setShowAgentDropdown(false);
      if (plusDropdownRef.current && !plusDropdownRef.current.contains(target)) setShowPlusDropdown(false);
      if (slashMenuRef.current && !slashMenuRef.current.contains(target)) setShowSlashMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const openModelPicker = () => setShowModelDropdown(true);
    const openContextMenu = () => setShowPlusDropdown(true);
    const toggleVoiceInput = () => {
      alert('Voice input triggered via shortcut (Feature coming soon)');
    };
    const openFilePicker = () => {
      fileInputRef.current?.click();
    };
    const focusChatInput = () => {
      textareaRef.current?.focus();
    };
    const stopAgent = () => {
      if (isAgentRunning) {
        onStop();
      }
    };
    const openCommandPalette = () => {
      textareaRef.current?.focus();
      const currentVal = textareaRef.current?.innerText || '';
      setContent(currentVal.startsWith('/') ? currentVal : '/' + currentVal);
      setShowSlashMenu(true);
      setSlashSearchQuery('');
      setSlashSelectedIndex(0);
    };

    window.addEventListener('open-model-picker', openModelPicker);
    window.addEventListener('open-context-menu', openContextMenu);
    window.addEventListener('toggle-voice-input', toggleVoiceInput);
    window.addEventListener('open-file-picker', openFilePicker);
    window.addEventListener('focus-chat-input', focusChatInput);
    window.addEventListener('stop-agent', stopAgent);
    window.addEventListener('open-command-palette', openCommandPalette);

    return () => {
      window.removeEventListener('open-model-picker', openModelPicker);
      window.removeEventListener('open-context-menu', openContextMenu);
      window.removeEventListener('toggle-voice-input', toggleVoiceInput);
      window.removeEventListener('open-file-picker', openFilePicker);
      window.removeEventListener('focus-chat-input', focusChatInput);
      window.removeEventListener('stop-agent', stopAgent);
      window.removeEventListener('open-command-palette', openCommandPalette);
    };
  }, [isAgentRunning, onStop]);

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
      setHoveredCategoryPosition({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width });
    } else {
      setHoveredCategoryPosition(null);
    }
  }, [hoveredCategory]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(Math.max(textareaRef.current.scrollHeight, 26), 120) + 'px';
    }
  }, [content]);

  const [queue, setQueue] = useState<{content: string, images: any[], mentionedFiles: string[], html: string}[]>([]);

  useEffect(() => {
    if (!isAgentRunning && queue.length > 0) {
      const nextMsg = queue[0];
      setQueue(q => q.slice(1));
      onSend(
        nextMsg.content,
        nextMsg.images.length > 0 ? nextMsg.images.map(img => ({
          name: img.file.name,
          path: img.file.name,
          content: img.url,
          sizeBytes: img.file.size
        })) : undefined,
        nextMsg.mentionedFiles
      );
    }
  }, [isAgentRunning, queue, onSend]);

  const handleQueueMessage = () => {
    if (content.trim() || selectedImages.length > 0 || textareaRef.current?.querySelector('span[data-mcp]') || textareaRef.current?.querySelector('span[data-slash]')) {
      let finalContent = content.trim();
      setQueue(prev => [...prev, {
        content: finalContent,
        images: [...selectedImages],
        mentionedFiles: [...mentionedFiles],
        html: textareaRef.current?.innerHTML || finalContent
      }]);
      if (textareaRef.current) textareaRef.current.innerHTML = '';
      setContent('');
      setMentionedFiles([]);
      setSelectedImages([]);
      setSelectedSlashCommands([]);
      setShowSlashMenu(false);
    }
  };

  const handleSend = () => {
    if (content.trim() || selectedImages.length > 0 || textareaRef.current?.querySelector('span[data-mcp]') || textareaRef.current?.querySelector('span[data-slash]')) {
      let finalContent = content.trim();
      
      onSend(
        finalContent,
        selectedImages.length > 0 ? selectedImages.map(img => ({
          name: img.file.name,
          path: img.file.name,
          content: img.url,
          sizeBytes: img.file.size
        })) : undefined,
        mentionedFiles
      );
      if (textareaRef.current) textareaRef.current.innerHTML = '';
      setContent('');
      setMentionedFiles([]);
      setSelectedImages([]);
      setSelectedSlashCommands([]);
      setShowSlashMenu(false);
    }
  };

  const insertSlashItem = (item: any) => {
    if (!textareaRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const cursor = selection.getRangeAt(0).startOffset;
    const textBefore = textareaRef.current.textContent || '';
    
    const match = textBefore.match(/(?:^|\s)\/([\w-]*)$/);
    if (match) {
      const matchLength = match[0].length;
      const isWhitespace = match[0].startsWith(' ');
      const actualMatchLength = isWhitespace ? matchLength - 1 : matchLength;
      
      const range = selection.getRangeAt(0);
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, Math.max(0, cursor - actualMatchLength));
        range.deleteContents();
        
        const triggerStr = item.type === 'skill' ? `use ${item.name} skill` : `use ${item.name}`;
        
        // Render icon to string
        let iconHtml = '';
        if (item.icon) {
          iconHtml = renderToString(item.icon);
        }
        
        const span = document.createElement('span');
        span.contentEditable = 'false';
        span.className = 'inline-flex items-center gap-1.5 px-1.5 py-0.5 mx-1 text-[13px] align-middle select-none bg-[#2b2b30] border border-white/10 rounded font-medium text-white shadow-sm';
        span.setAttribute('data-slash', item.id);
        span.setAttribute('data-trigger', triggerStr);
        span.innerHTML = `<span class="opacity-70 flex items-center justify-center w-3.5 h-3.5">${iconHtml}</span><span class="leading-none text-white">${item.displayName}</span>`;
        
        range.insertNode(span);
        
        const spaceNode = document.createTextNode(' ');
        range.setStartAfter(span);
        range.insertNode(spaceNode);
        range.setStartAfter(spaceNode);
        range.setEndAfter(spaceNode);
        selection.removeAllRanges();
        selection.addRange(range);
        
        setShowSlashMenu(false);
        const event = new Event('input', { bubbles: true });
        textareaRef.current.dispatchEvent(event);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAtMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtSelectedIndex(prev => Math.min(prev + 1, atItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (atItems[atSelectedIndex]) {
          insertAtItem(atItems[atSelectedIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAtMenu(false);
        return;
      }
    }

    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => Math.min(prev + 1, slashItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (slashItems[slashSelectedIndex]) {
          insertSlashItem(slashItems[slashSelectedIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isAgentRunning) {
        handleQueueMessage();
      } else {
        handleSend();
      }
    }

    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      


      if (selection && selection.isCollapsed && textareaRef.current) {
        const range = selection.getRangeAt(0);
        let node = range.startContainer;
        let prevNode = node.previousSibling;
        
        if (node.nodeType === Node.ELEMENT_NODE && node === textareaRef.current) {
          prevNode = node.childNodes[range.startOffset - 1];
        } else if (range.startOffset === 0) {
          prevNode = node.previousSibling;
        } else {
          prevNode = null;
        }
        
        if (prevNode && prevNode.nodeType === Node.ELEMENT_NODE && ((prevNode as HTMLElement).dataset.mcp || (prevNode as HTMLElement).dataset.slash)) {
          e.preventDefault();
          prevNode.parentNode?.removeChild(prevNode);
          
          // Dispatch input event to update state
          const event = new Event('input', { bubbles: true });
          textareaRef.current.dispatchEvent(event);
        }
      }
        }
  };

  const handleTextChange = (e: React.FormEvent<HTMLDivElement>) => {
    if (!textareaRef.current) return;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      // Get text before cursor for slash menu
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(textareaRef.current);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const textBeforeCursor = preCaretRange.toString();
      
      const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
        if (slashMatch) {
          setShowSlashMenu(true);
          setSlashSearchQuery(slashMatch[1]);
          setSlashSelectedIndex(0);
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0).cloneRange();
            const rect = range.getBoundingClientRect();
            const containerRect = textareaRef.current?.getBoundingClientRect();
            if (rect && containerRect) {
               setSlashMenuPos(Math.max(0, rect.left - containerRect.left - 20));
            }
          }
        } else {
          setShowSlashMenu(false);
        }

        const atMatch = textBeforeCursor.match(/(?:^|\s)@([\w-]*)$/);
        if (atMatch) {
          setShowAtMenu(true);
          setAtSearchQuery(atMatch[1]);
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0).cloneRange();
            const rect = range.getBoundingClientRect();
            const containerRect = textareaRef.current?.getBoundingClientRect();
            if (rect && containerRect) {
               setAtMenuPos(Math.max(0, rect.left - containerRect.left - 20));
            }
          }
        } else {
          setShowAtMenu(false);
        }

        const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        for (const alias of getActiveAliases()) {
          const triggerRegex = new RegExp(`(^|\\s)(${alias.trigger})\\s$`, 'i');
          const match = text.match(triggerRegex);
          if (match) {
            const prefixMatch = match[1];
            const triggerMatch = match[2];
            
            const startIdx = match.index + prefixMatch.length;
            const endIdx = startIdx + triggerMatch.length;
            
            const beforeText = text.slice(0, startIdx);
            const parent = node.parentNode;
            if (!parent) continue;
            
            const chip = document.createElement('span');
            chip.contentEditable = 'false';
            chip.className = 'inline-flex items-center gap-1.5 px-1 py-0.5 mx-1 text-[14px] align-middle select-none bg-transparent';
            chip.dataset.mcp = alias.id;
            chip.dataset.mcpName = alias.name;
            chip.dataset.trigger = alias.trigger;
            chip.innerHTML = `<img src="${alias.icon}" alt="${alias.name}" class="w-4 h-4 object-contain ${(alias.id === 'github' || alias.id === 'vercel') ? 'filter invert opacity-90' : ''}" /><span class="text-[#4b93ff] font-medium">${alias.name}</span>`;
            
            const beforeNode = document.createTextNode(beforeText);
            const spaceNode = document.createTextNode('\u00A0');
            
            parent.insertBefore(beforeNode, node);
            parent.insertBefore(chip, node);
            parent.insertBefore(spaceNode, node);
            parent.removeChild(node);
            
            const newRange = document.createRange();
            newRange.setStart(spaceNode, 1);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            break;
          }
        }
      }
    }
    
    if (textareaRef.current.innerHTML === '<br>' || textareaRef.current.innerHTML === '<br/>') {

    
      textareaRef.current.innerHTML = '';

    
    }
    
    let textContent = '';
    for (const child of Array.from(textareaRef.current.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        textContent += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.dataset && el.dataset.trigger) {
          textContent += el.dataset.trigger;
        } else {
          textContent += el.innerText || el.textContent;
        }
      }
    }
    
    setContent(textContent);
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

  const handleSuggestionClick = (prompt: string) => {
    if (!textareaRef.current) return;
    const match = prompt.match(/^(@[a-zA-Z0-9_]+)\s(.*)$/i);
    if (match) {
        const trigger = match[1];
        const rest = match[2];
        const alias = getActiveAliases().find(a => a.trigger.toLowerCase() === trigger.toLowerCase());
        if (alias) {
            textareaRef.current.innerHTML = `<span contentEditable="false" class="inline-flex items-center gap-1.5 px-1 py-0.5 mx-1 text-[14px] align-middle select-none bg-transparent" data-mcp="${alias.id}" data-mcp-name="${alias.name}" data-trigger="${alias.trigger}"><img src="${alias.icon}" alt="${alias.name}" class="w-4 h-4 object-contain ${(alias.id === 'github' || alias.id === 'vercel') ? 'filter invert opacity-90' : ''}" /><span class="text-[#4b93ff] font-medium">${alias.name}</span></span>&nbsp;${rest}`;
            setContent(prompt);
            return;
        }
    }
    textareaRef.current.innerText = prompt;
    setContent(prompt);
  };

  const suggestedActions = React.useMemo(() => {
    let pool = [];
      if (vercelConnected) {
      pool.push(
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "List deployments", prompt: "@Vercel List my recent deployments" },
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "Check build logs", prompt: "@Vercel Check build logs for my latest deployment" },
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "List projects", prompt: "@Vercel List all my Vercel projects" }
      );
    }
    if (figmaConnected) {
        pool.push(
          { icon: <img src="./figma.png" className="w-3.5 h-3.5" />, label: "Review design", prompt: "@Figma Review the layout of the homepage design" },
          { icon: <img src="./figma.png" className="w-3.5 h-3.5" />, label: "Extract tokens", prompt: "@Figma Extract color and typography tokens from the design system" },
          { icon: <img src="./figma.png" className="w-3.5 h-3.5" />, label: "Export assets", prompt: "@Figma Find and export the logo and icon assets" },
          { icon: <img src="./figma.png" className="w-3.5 h-3.5" />, label: "Check contrast", prompt: "@Figma Check the color contrast of buttons for accessibility" }
        );
      }
      if (githubConnected) {
        pool.push(
          { icon: <img src="./github.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "Review PR", prompt: "@GitHub Review open pull requests" },
          { icon: <img src="./github.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "Check issues", prompt: "@GitHub List my assigned issues" },
          { icon: <img src="./github.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "Check actions", prompt: "@GitHub Check the status of recent actions" }
        );
      }
    if (gmailConnected) {
      pool.push(
        { icon: <Mail size={14} />, label: "Read unread emails", prompt: "@Gmail Read my latest unread emails" },
        { icon: <PenLine size={14} />, label: "Draft an email", prompt: "@Gmail Help me draft a new email" },
        { icon: <Search size={14} />, label: "Search inbox", prompt: "@Gmail Search my inbox for recent newsletters" },
        { icon: <Trash2 size={14} />, label: "Clean up spam", prompt: "@Gmail Find and delete spam emails" }
      );
    }
    if (gdriveConnected) {
      pool.push(
        { icon: <Folder size={14} />, label: "List recent files", prompt: "@Drive List my recent files from Google Drive" },
        { icon: <Search size={14} />, label: "Search drive", prompt: "@Drive Search my Google Drive for reports" },
        { icon: <FileText size={14} />, label: "Summarize a doc", prompt: "@Drive Find the latest project spec and summarize it" },
        { icon: <Upload size={14} />, label: "Upload workspace", prompt: "@Drive Upload my current workspace files to a new Drive folder" }
      );
    }
    if (supabaseConnected) {
      pool.push(
        { icon: <Database size={14} />, label: "List tables", prompt: "@Supabase List all tables in my Supabase database" },
        { icon: <Search size={14} />, label: "Query users", prompt: "@Supabase Show me the first 10 rows of the users table in Supabase" },
        { icon: <PenLine size={14} />, label: "Create a table", prompt: "@Supabase Create a new table in Supabase for tracking blog posts" },
        { icon: <FileText size={14} />, label: "Schema summary", prompt: "@Supabase Summarize the database schema from my Supabase project" }
      );
    }

    if (vercelConnected) {
      pool.push(
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "List deployments", prompt: "@Vercel List my recent deployments" },
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "Check build logs", prompt: "@Vercel Check build logs for my latest deployment" },
        { icon: <img src="./vercel.png" className="w-3.5 h-3.5 filter invert opacity-90" />, label: "List projects", prompt: "@Vercel List all my Vercel projects" }
      );
    }
    if (figmaConnected) {
      pool.push(
        { icon: <PenLine size={14} />, label: "Extract design", prompt: "@Figma Extract CSS from my recent Figma file" },
        { icon: <Folder size={14} />, label: "Design tokens", prompt: "@Figma Read design tokens from the active Figma document" }
      );
    }
      if (githubConnected) {
        pool.push(
          { icon: <Folder size={14} />, label: "Review PR", prompt: "@GitHub Review open pull requests" },
          { icon: <FileText size={14} />, label: "Check issues", prompt: "@GitHub List my assigned issues" }
        );
      }
    if (pool.length === 0) return [];

    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, 4);
  }, [gmailConnected, gdriveConnected, supabaseConnected, figmaConnected, vercelConnected]);

  return (
    <div className="flex flex-col gap-2 relative w-full mx-auto max-w-[750px]">
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute bottom-[calc(100%+12px)] left-0 right-0 flex justify-center z-20 pointer-events-none"
          >
            <div className="pointer-events-auto w-[85%] max-w-[650px] bg-[#16161a]/95 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.6)] rounded-xl flex items-center justify-between p-2.5 backdrop-blur-xl">
              
              {/* Left Side: Status & Content */}
              <div className="flex items-center gap-3 overflow-hidden min-w-0 pr-4">
                
                {/* Status Badge */}
                <div className="flex items-center gap-2 shrink-0 pl-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                  <span className="text-[11px] font-bold text-green-500 tracking-widest uppercase">
                    {queue.length > 1 ? `1/${queue.length} Queued` : 'Queued'}
                  </span>
                </div>

                {/* Preview Content */}
                <div className="flex items-center gap-2.5 overflow-hidden shrink min-w-0">
                  {queue[0].images.map((img, i) => (
                    <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={`img-${i}`} src={img.url} className="w-7 h-7 rounded-lg object-cover shrink-0 shadow-sm border border-white/10" alt="queued attachment" />
                  ))}
                  
                  {queue[0].mentionedFiles.map((file, i) => (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={`file-${i}`} className="text-[11px] font-medium bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-white/80 shrink-0 flex items-center gap-1.5">
                      <FileText size={12} className="text-white/40" />
                      {file.split(/[/\\]/).pop()}
                    </motion.span>
                  ))}
                  
                  <div 
                    className="text-[13px] text-white/80 truncate flex items-center gap-1.5 [&>span]:!text-[12px] [&>span]:!px-2 [&>span]:!py-0.5 [&>span]:!rounded-lg [&>span]:!bg-white/5 [&>span]:!border [&>span]:!border-white/10 [&>span>img]:!w-3.5 [&>span>img]:!h-3.5 whitespace-nowrap"
                    dangerouslySetInnerHTML={{ __html: queue[0].html }}
                  />
                </div>
              </div>

              {/* Right Side: Actions */}
              <div className="flex items-center gap-2 shrink-0 border-l border-white/10 pl-3">
                <Tooltip content="Send Immediately">
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const msg = queue[0];
                      setQueue(q => q.slice(1));
                      onStop();
                      setTimeout(() => {
                        onSend(
                          msg.content,
                          msg.images.length > 0 ? msg.images.map(img => ({ name: img.file.name, path: img.file.name, content: img.url, sizeBytes: img.file.size })) : undefined,
                          msg.mentionedFiles
                        );
                      }, 100);
                    }}
                    className="w-8 h-8 flex items-center justify-center bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg transition-colors shadow-lg"
                  >
                    <Send size={14} />
                  </motion.button>
                </Tooltip>
                
                <Tooltip content="Remove from queue">
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setQueue(q => q.slice(1))}
                    className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <X size={16} />
                  </motion.button>
                </Tooltip>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute -top-6 right-2 z-10 flex justify-end">
        <button
          onClick={() => setShowConnectModal(!showConnectModal)}
          className="text-[12px] text-[#a8a8b1] hover:text-white transition-colors flex items-center"
        >
          {gmailConnected || gdriveConnected || supabaseConnected || figmaConnected || vercelConnected || githubConnected ? (
            (() => {
              const connectedServices = [];
              if (gmailConnected) connectedServices.push(
                <Tooltip key="gmail" content="Gmail">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[5] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./gmail.png" alt="Gmail" className="w-4 h-4 object-contain filter drop-shadow-sm" />
                  </div>
                </Tooltip>
              );if (gdriveConnected) connectedServices.push(
                <Tooltip key="gdrive" content="Google Drive">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[4] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./drive.png" alt="Google Drive" className="w-4 h-4 object-contain filter drop-shadow-sm" />
                  </div>
                </Tooltip>
              );
              if (supabaseConnected) connectedServices.push(
                <Tooltip key="supabase" content="Supabase">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[3] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./supabase.png" alt="Supabase" className="w-4 h-4 object-contain filter drop-shadow-sm" />
                  </div>
                </Tooltip>
              );


              if (figmaConnected) connectedServices.push(
                <Tooltip key="figma" content="Figma">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[2] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./figma.png" alt="Figma" className="w-4 h-4 object-contain filter drop-shadow-sm" />
                  </div>
                </Tooltip>
              );

              if (githubConnected) connectedServices.push(
                <Tooltip key="github" content="GitHub">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[1] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./github.png" alt="GitHub" className="w-4 h-4 object-contain filter invert opacity-90 drop-shadow-sm" />
                  </div>
                </Tooltip>
              );



              if (vercelConnected) connectedServices.push(
                <Tooltip key="vercel" content="Vercel">
                  <div className="w-7 h-7 bg-[#1c1c21] border-2 border-[#0c0c0e] rounded-full flex items-center justify-center shrink-0 relative z-[0] hover:z-[10] hover:-translate-y-1 hover:scale-[1.15] transition-all cursor-pointer">
                    <img src="./vercel.png" alt="Vercel" className="w-4 h-4 object-contain filter invert opacity-90 drop-shadow-sm" />
                  </div>
                </Tooltip>
              );
              return (
                <div className="flex items-center transition-colors group -space-x-2.5 py-0.5 px-1">
                  {connectedServices}
                </div>
              );
            })()
          ) : (
            <span className="font-semibold text-white/80 hover:text-white">Connect +</span>
          )}
        </button>
      </div>
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

      <BorderGlow
        animated={isAgentRunning}
        backgroundColor="#1c1c21"
        borderRadius={16}
        className={cn(
          "shadow-2xl transition-all duration-300 pointer-events-auto relative mx-auto",
          "w-full p-3 flex flex-col focus-within:border-white/20 border-white/5"
        )}
      >
          <>
            <AnimatePresence>
              {showAtMenu && atItems.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ left: `${atMenuPos}px` }}
                    className="absolute bottom-full mb-2 w-[350px] bg-[#1c1c21] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[300px]"
                  >
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                      {atItems.map((item: any, index: number) => (
                        <button
                          key={item.id}
                          onClick={() => insertAtItem(item)}
                          onMouseEnter={() => setAtSelectedIndex(index)}
                          className={cn(
                            "w-full px-3 py-2 text-left flex items-center gap-3 rounded-lg transition-colors",
                            atSelectedIndex === index ? "bg-white/10" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded bg-black/40">
                            <img src={item.icon} alt={item.name} className={`w-4 h-4 object-contain ${(item.id === "github" || item.id === "vercel") ? "filter invert opacity-90" : ""}`} />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[13px] font-medium text-white truncate flex items-center gap-2">
                              {item.trigger}
                            </span>
                            <span className="text-[10px] text-white/40 truncate">{item.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {showSlashMenu && (
                <motion.div
                  ref={slashMenuRef}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  style={{ left: `${slashMenuPos}px` }}
                  className="absolute bottom-full mb-2 w-[400px] bg-[#1c1c21] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[300px]"
                >
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                    {slashItems.length === 0 ? (
                      <div className="text-xs text-white/40 text-center py-4">No results found</div>
                    ) : (
                      slashItems.map((item, index) => (
                        <button
                          key={item.id}
                          onClick={() => insertSlashItem(item)}
                          onMouseEnter={() => setSlashSelectedIndex(index)}
                          className={cn(
                            "w-full px-3 py-2 text-left flex items-center gap-3 rounded-lg transition-colors",
                            slashSelectedIndex === index ? "bg-white/10" : "hover:bg-white/5"
                          )}
                        >
                          <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded bg-black/40">
                            {item.icon}
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-medium text-white truncate flex items-center gap-2">
                              <span className="opacity-40 text-[10px] font-mono px-1 rounded bg-black/40">&lt;/&gt;</span>
                              {item.displayName}
                            </span>
                            <span className="text-[10px] text-white/40 truncate">{item.description}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

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


            <div className="relative w-full">
              <div
                ref={textareaRef}
                contentEditable={true}
                onInput={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  if (text) {
                    document.execCommand('insertText', false, text);
                  }
                  const items = e.clipboardData.items;
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const file = items[i].getAsFile();
                      if (file) {
                        handleImageUpload(file);
                      }
                    }
                  }
                }}
                data-placeholder={selectedSlashCommands.length > 0 || selectedImages.length > 0 || mentionedFiles.length > 0 || (textareaRef.current && textareaRef.current.querySelector('span[data-mcp]')) ? "" : "Ask anything, / for skills and @ for actions"}
                className="flex-1 min-w-[50px] bg-transparent outline-none text-[#e2e2e3] text-[14px] custom-scrollbar min-h-[26px] max-h-[120px] leading-relaxed self-end mb-1 break-words overflow-y-auto whitespace-pre-wrap empty:before:content-[attr(data-placeholder)] empty:before:text-[#6b6b73] empty:before:pointer-events-none empty:before:block"
              />
            </div>

            <div className="flex items-center justify-between mt-[1.2rem]">
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
                  </button>
                  {typeof document !== 'undefined' && createPortal(
                    <AnimatePresence>
                      {showModelDropdown && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-sans">
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setShowModelDropdown(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 10 }}
                            transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
                            className="relative w-full max-w-[650px] bg-[#16161a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden"
                          >
                            {/* Header: Search and Close */}
                            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.05]">
                              <div className="relative flex-1">
                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                                <input
                                  type="text"
                                  placeholder="Search models..."
                                  value={modelSearchQuery}
                                  onChange={(e) => setModelSearchQuery(e.target.value)}
                                  className="w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.08] border border-white/5 transition-all rounded-lg pl-10 pr-4 py-2 text-[13px] text-white placeholder-white/40 outline-none focus:border-purple-500/50"
                                />
                              </div>
                              <button onClick={() => setShowModelDropdown(false)} className="text-white/40 hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5 shrink-0">
                                <X size={20} />
                              </button>
                            </div>

                            {/* Content: Single Grid */}
                            <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {filteredModels.map(model => {
                                  const isSelected = config.model === model.name || (config.model && config.model.includes(model.name));
                                  return (
                                    <div
                                      key={model.id}
                                      ref={(el) => { if (el) modelItemRefs.current[model.id] = el; }}
                                      onMouseEnter={() => setHoveredCategory(model.id)}
                                    >
                                      <button
                                        disabled={model.isPro}
                                        onClick={() => {
                                          if (!model.isPro && model.submodels.length === 0) {
                                            updateConfig({ model: model.name });
                                            setShowModelDropdown(false);
                                          }
                                        }}
                                        className={cn(
                                          "w-full p-3.5 rounded-xl border text-left transition-all flex flex-col relative h-[80px] group",
                                          isSelected ? "bg-white/[0.08] border-purple-500/50" : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]",
                                          model.isPro && !isSelected && "opacity-50"
                                        )}
                                      >
                                        <div className="flex items-start justify-between w-full">
                                          <div className="flex items-center gap-3">
                                            <div className="text-white/80 p-1.5 rounded-lg bg-white/5">{model.icon}</div>
                                            <div>
                                              <div className="font-semibold text-white text-[13px] tracking-tight flex items-center gap-1.5">
                                                {model.name}
                                                {model.id === 'minimax' ? (
                                                  <img src="./Premium.png" alt="Premium" className="h-[28px] object-contain ml-1.5 -my-2" />
                                                ) : model.isPro && (
                                                  ['glm', 'kimi', 'qwen', 'deepseek'].includes(model.id) ? (
                                                    <img src="./PRO.png" alt="PRO" className="h-[28px] object-contain ml-1.5 -my-2" />
                                                  ) : ['gpt6astra', 'gpt56', 'qwen38', 'claude'].includes(model.id) ? (
                                                    <img src="./Premium.png" alt="Premium" className="h-[28px] object-contain ml-1.5 -my-2" />
                                                  ) : (
                                                    <span className="text-[8px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1 py-0.5 rounded font-bold ml-1.5">PRO+</span>
                                                  )
                                                )}
                                              </div>
                                              <div className="text-[11px] text-white/40 mt-1">
                                                {model.id === 'minimax' ? 'Free Limited Time Tier' :
                                                  ['glm', 'kimi', 'qwen', 'deepseek'].includes(model.id) ? 'Pro Tier' :
                                                    ['gpt6astra', 'gpt56', 'qwen38', 'claude'].includes(model.id) ? 'Premium Tier' :
                                                      model.isPro ? 'Pro+ Tier' : 'Standard Tier'}
                                              </div>
                                            </div>
                                          </div>

                                          <div className={cn("w-[16px] h-[16px] rounded-full border flex items-center justify-center shrink-0", isSelected ? "border-purple-400" : "border-white/20 group-hover:border-white/40")}>
                                            {isSelected && <div className="w-[8px] h-[8px] rounded-full bg-purple-400" />}
                                          </div>
                                        </div>

                                        {model.submodels.length > 0 && (
                                          <div className={cn("absolute bottom-2.5 right-2.5", isSelected ? "text-purple-400" : "text-white/30 group-hover:text-white/60")}>
                                            <ChevronDown size={14} />
                                          </div>
                                        )}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>,
                    document.body
                  )}

                  {/* Portal for submodel dropdown and tooltips */}
                  {showModelDropdown && hoveredCategory && hoveredCategoryPosition && (() => {
                    const model = allModels.find(m => m.id === hoveredCategory);
                    if (!model) return null;

                    if (model.isPro) {
                      const getTooltipText = (modelId: string) => {
                        if (['glm', 'kimi', 'qwen', 'deepseek'].includes(modelId)) return 'Upgrade your plan to Pro tier or Higher';
                        if (['gpt6astra', 'gpt56', 'qwen38', 'claude'].includes(modelId)) return 'Upgrade your plan to Premium';
                        return 'Upgrade your plan to Pro+';
                      };

                      return createPortal(
                        <AnimatePresence>
                          <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -5 }}
                            transition={{ duration: 0.15 }}
                            style={{
                              position: 'fixed',
                              top: hoveredCategoryPosition.bottom - 32,
                              left: hoveredCategoryPosition.left + 16,
                              zIndex: 9999,
                            }}
                            className="px-3 py-1.5 bg-[#1f2937] text-white text-[12px] rounded-lg whitespace-nowrap shadow-xl border border-white/5"
                          >
                            {getTooltipText(model.id)}
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
                            top: hoveredCategoryPosition.top + 45,
                            left: hoveredCategoryPosition.left + 16,
                            zIndex: 9999,
                          }}
                          className="w-36 bg-[#16161a] border border-white/10 rounded-xl shadow-2xl p-1.5 flex flex-col ml-1"
                        >
                          {model.submodels.map(m => (
                            <button
                              key={m}
                              onClick={() => { updateConfig({ model: model.id === 'qwen' ? `Qwen 3.7 ${m}` : model.id === 'gpt56' ? `GPT-5.6 ${m}` : model.id === 'deepseek' ? `DeepSeek v4 ${m}` : model.id === 'glm' ? `GLM ${m}` : m }); setShowModelDropdown(false); }}
                              className="px-3 py-2 text-[13px] font-medium text-left text-white/70 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all mb-0.5"
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
                  (content.trim().length > 0 || selectedImages.length > 0 || selectedSlashCommands.length > 0 || (textareaRef.current?.querySelector('span[data-mcp]') !== null)) ? (
                    <Tooltip content="Queue Prompt">
                      <button
                        onClick={handleQueueMessage}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-[#007acc] hover:bg-[#0088dd] text-white shadow-lg transition-all duration-200 hover:scale-105"
                      >
                        <Send size={14} />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Stop Generation">
                      <button
                        onClick={onStop}
                        className="w-8 h-8 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg"
                      >
                        <Square size={14} fill="currentColor" />
                      </button>
                    </Tooltip>
                  )
                ) : (
                  <div className="relative group">
                    {isListening ? (
                      <div
                        className="w-8 h-8 rounded-full cursor-pointer flex items-center justify-center bg-[#1c1c21] relative"
                        onClick={() => {
                          setIsListening(false);
                          if (micStream) {
                            micStream.getTracks().forEach(t => t.stop());
                            setMicStream(null);
                          }
                        }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ width: '48px', height: '48px' }}>
                          <Orb
                            hoverIntensity={0.50}
                            rotateOnHover
                            hue={318}
                            forceHoverState
                            backgroundColor="#1c1c21"
                            analyser={analyserRef.current}
                          />
                        </div>
                      </div>
                    ) : (
                      <Tooltip content={!hasProject ? "Choose a project first" : (content.trim().length > 0 || selectedImages.length > 0 || selectedSlashCommands.length > 0 || (textareaRef.current?.querySelector('span[data-mcp]') !== null)) ? "Send message" : "Voice input"}>
                        <button
                          onClick={() => {
                            if (!hasProject) return;
                            if ((content.trim() || selectedImages.length > 0 || selectedSlashCommands.length > 0 || (textareaRef.current?.querySelector('span[data-mcp]') !== null)) && hasProject) {
                              handleSend();
                            } else {
                              navigator.permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
                                if (result.state === 'granted') {
                                  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                                    setMicStream(stream);
                                    new Audio('/VoiceInput.wav').play().catch(() => {});
                                    setIsListening(true);
                                  }).catch(() => {
                                    setShowMicModal(true);
                                  });
                                } else {
                                  setShowMicModal(true);
                                }
                              }).catch(() => {
                                setShowMicModal(true);
                              });
                            }
                          }}
                          aria-disabled={!hasProject}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                            !hasProject
                              ? "bg-gray-600 text-gray-400 cursor-not-allowed opacity-50"
                              : (content.trim().length > 0 || selectedImages.length > 0 || selectedSlashCommands.length > 0 || (textareaRef.current?.querySelector('span[data-mcp]') !== null))
                                ? "bg-[#007acc] hover:bg-[#0088dd] text-white shadow-lg"
                                : "bg-white/5 hover:bg-white/10 text-[#8b8b93] hover:text-white"
                          )}
                        >
                          {(content.trim().length > 0 || selectedImages.length > 0 || selectedSlashCommands.length > 0 || (textareaRef.current?.querySelector('span[data-mcp]') !== null)) && hasProject ? <Send size={14} /> : <Mic size={14} />}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
      </BorderGlow>

      {suggestedActions.length > 0 && !hasMessages && (
        <div className="flex gap-3 items-center justify-between w-full mt-3 z-10">
          {suggestedActions.map((suggestion, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: (i === 1 || i === 2) ? 0 : 0.15,
                duration: 0.4,
                ease: "easeOut"
              }}
              className="flex-1 flex"
            >
              <button
                onClick={() => handleSuggestionClick(suggestion.prompt)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-2 bg-[#1c1c21] hover:bg-[#25252b] border border-white/5 hover:border-white/10 rounded-xl text-[12px] text-zinc-300 hover:text-white transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.5)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.7)] hover:-translate-y-1 truncate"
              >
                {suggestion.icon}
                <span className="font-medium truncate">{suggestion.label}</span>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showConnectModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-sans bg-black/80"
              onClick={() => setShowConnectModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full max-w-[800px] bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
                  <div className="text-[18px] font-semibold text-zinc-100 tracking-wide">Connectors</div>
                  <button onClick={() => setShowConnectModal(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors p-1.5 rounded-md hover:bg-white/5 shrink-0">
                    <X size={18} />
                  </button>
                </div>
                <div className="px-6 pt-5 pb-3">
                  <div className="flex bg-zinc-800/50 rounded-lg p-2.5 items-center border border-white/5 focus-within:border-white/20 transition-colors">
                    <Search size={16} className="text-zinc-500 ml-2" />
                    <input type="text" placeholder="Search connectors" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-zinc-300 ml-3 text-[14px] w-full placeholder:text-zinc-500" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <AnimatePresence>
                      {filteredConnectors.map((c, i) => (
                        <motion.div
                          key={c.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.15, delay: i * 0.02, ease: "easeOut" }}
                          className="w-full p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors duration-200 flex items-center gap-4 group text-left"
                        >
                          <div className="w-12 h-12 rounded-[14px] bg-white flex items-center justify-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
                            <img src={c.icon} alt={c.name} className={`w-8 h-8 object-contain ${c.opacity || ''}`} />
                          </div>
                          <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                            <div className="text-[15px] font-medium text-zinc-100 group-hover:text-white transition-colors">{c.name}</div>
                            <div className="text-[12px] text-zinc-500 leading-tight pr-2">{c.desc}</div>
                          </div>
                            <div className="shrink-0 flex items-center ml-2">
                              {(c.onConnect || c.onDisconnect) && (
                                !c.connected ? (
                                  <button
                                    onClick={c.onConnect}
                                    className="w-8 h-8 rounded-lg bg-transparent border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
                                    <Plus size={16} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={c.onDisconnect}
                                    className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all">
                                    <Minus size={16} />
                                  </button>
                                )
                              )}
                            </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
          {showMicModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-sans bg-black/80 backdrop-blur-sm"
              onClick={() => setShowMicModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full max-w-[400px] bg-[#1c1c21] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-[#25252b] rounded-full flex items-center justify-center mb-2">
                    <Mic size={32} className="text-[#007acc]" />
                  </div>
                  <h3 className="text-xl font-semibold text-white">Allow Microphone</h3>
                  <p className="text-sm text-zinc-400 pb-2">
                    Quantix needs access to your microphone to enable voice input.
                  </p>
                  <div className="flex gap-3 w-full mt-6">
                    <button 
                      onClick={() => setShowMicModal(false)} 
                      className="flex-1 py-2.5 rounded-lg font-medium text-sm text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors border border-white/5 hover:border-white/10"
                    >
                      Deny
                    </button>
                    <button 
                      onClick={async () => {
                        setShowMicModal(false);
                        try {
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                          setMicStream(stream);
                          new Audio('/VoiceInput.wav').play().catch(() => {});
                          setIsListening(true);
                        } catch (err) {
                          console.error("Microphone access denied:", err);
                          alert("Microphone permission was denied by the browser or system. Please enable it in your settings.");
                        }
                      }} 
                      className="flex-1 py-2.5 rounded-lg font-medium text-sm text-white bg-[#007acc] hover:bg-[#0088dd] transition-colors shadow-lg"
                    >
                      Allow
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
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




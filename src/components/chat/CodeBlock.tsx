import React, { useState } from 'react';
import { Check, Copy, Code } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function CodeBlock({ code, language, filename, showLineNumbers = true, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayLanguage = filename || language || 'text';
  // Capitalize language for display
  const capLanguage = displayLanguage.charAt(0).toUpperCase() + displayLanguage.slice(1);

  return (
    <div className={cn("rounded-lg border border-white/10 bg-[#0d0d12] overflow-hidden my-4 shadow-xl", className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1f] border-b border-white/5">
        <div className="flex items-center gap-2 text-white/70">
          <Code size={14} className="opacity-70" />
          <span className="font-mono font-medium text-[12px] uppercase tracking-wider">{filename || language || 'text'}</span>
        </div>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors text-[11px] font-sans font-medium"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="text-[13px] w-full max-w-full overflow-auto max-h-[500px] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={language || 'text'}
          PreTag="div"
          showLineNumbers={showLineNumbers}
          wrapLines={true}
          customStyle={{
            margin: 0,
            background: 'transparent',
            padding: '1rem',
            overflow: 'visible'
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1.2em',
            color: '#4b5563',
            textAlign: 'right',
            userSelect: 'none'
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

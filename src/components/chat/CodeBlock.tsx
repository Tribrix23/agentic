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
    <div className={cn("rounded-xl border border-white/10 bg-[#0d0d12] overflow-hidden my-3 shadow-lg", className)}>
      <div className="flex items-center justify-between px-4 py-3 bg-[#0d0d12]">
        <div className="flex items-center gap-2 text-white/90 font-bold font-serif tracking-wide text-sm">
          <Code size={16} className="text-white/60" />
          <span>{capLanguage}</span>
        </div>
        <button 
          onClick={handleCopy}
          className="text-white/40 hover:text-white transition-colors"
        >
          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
      <div className="text-[14px]">
        <SyntaxHighlighter
          style={vscDarkPlus as any}
          language={language || 'text'}
          PreTag="div"
          showLineNumbers={showLineNumbers}
          wrapLines={true}
          customStyle={{
            margin: 0,
            background: '#0d0d12',
            padding: '0 1rem 1rem 1rem', // Removed top padding to sit closer to header
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1.2em',
            color: '#6e7681',
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

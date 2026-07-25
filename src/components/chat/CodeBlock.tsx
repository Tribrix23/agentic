import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, filename, showLineNumbers = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderCode = (text: string) => {
    if (typeof text !== 'string') text = String(text || '');
    
    // Very basic regex highlighter for standard stuff
    // This is a naive implementation per the prompt's request to avoid heavy libs
    let html = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Highlight strings
    html = html.replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="text-green-400">$1</span>');
    // Highlight keywords
    html = html.replace(/\b(import|export|from|function|const|let|var|return|if|else|for|while|class|interface|type)\b/g, '<span class="text-blue-400">$1</span>');
    // Highlight numbers
    html = html.replace(/\b(\d+)\b/g, '<span class="text-orange-400">$1</span>');
    
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="rounded-lg border border-white/5 bg-[#0f0f13] overflow-hidden my-2">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1c1c21] border-b border-white/5">
        <span className="text-xs text-white/50 font-mono">
          {filename || language || 'text'}
        </span>
        <button 
          onClick={handleCopy}
          className="text-white/40 hover:text-white transition-colors"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-sm font-mono text-white/80 whitespace-pre">
        {renderCode(code)}
      </div>
    </div>
  );
}

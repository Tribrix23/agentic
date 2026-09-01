import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../App';
import { CodeBlock } from './CodeBlock';

import { Tooltip } from "../ui/Tooltip";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  onArtifactClick?: (path: string) => void;
}

/**
 * Normalise various LaTeX delimiters the model may emit into the standard
 * $…$ / $$…$$ form that remark-math understands.
 *
 *  [ …display math… ]  →  $$…$$
 *  \[ …display math… \]  →  $$…$$
 *  \( …inline math… \)  →  $…$
 */
function preprocessMath(text: string): string {
  // \[ ... \] → $$ ... $$
  text = text.replace(/\\\[([^]*?)\\\]/g, (_m, body) => `$$${body}$$`);
  // \( ... \) → $ ... $
  text = text.replace(/\\\(([^]*?)\\\)/g, (_m, body) => `$${body}$`);
  // Bare [ ... ] display math (must be on its own line to avoid breaking links)
  text = text.replace(/^\[ ([^]*?) \]$/gm, (_m, body) => `$$${body}$$`);
  return text;
}

export function MarkdownRenderer({ content, isStreaming, onArtifactClick }: MarkdownRendererProps) {
  // If streaming, append a blinking cursor
  const rawContent = isStreaming ? `${content} ▍` : content;
  const displayContent = preprocessMath(rawContent);

  return (
    <div className="prose prose-invert max-w-none w-full min-w-0 prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-white/10 prose-p:leading-relaxed prose-a:text-blue-400 text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, { throwOnError: false, output: 'html' }]]}
        components={{
          h1: ({ children }) => <h1 className="text-xl leading-7 font-semibold text-white mb-4 last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mt-7 mb-3 pb-2 border-b border-white/10 last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-violet-200 mt-5 mb-2 last:mb-0">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0 text-inherit leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-4 pl-5 list-disc space-y-1 marker:text-violet-400 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-4 pl-5 list-decimal space-y-1 marker:text-violet-400 last:mb-0">{children}</ol>,
          table: ({ children }) => <div className="my-4 last:mb-0 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[420px] border-collapse text-left text-xs">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-white/5 text-white">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 font-medium border-b border-white/10">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 align-top border-b border-white/5 text-inherit">{children}</td>,
          blockquote: ({ children }) => <blockquote className="my-4 last:mb-0 border-l-2 border-violet-500 pl-3 text-inherit opacity-80">{children}</blockquote>,
          code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (!inline && language) {
              return (
                <CodeBlock 
                  code={String(children).replace(/\n$/, '')} 
                  language={language}
                />
              );
            }
            
            // Inline code
            return (
              <code className={cn("font-mono text-[12px] text-blue-200 bg-blue-500/10 border border-blue-500/10 rounded px-1.5 py-0.5", className)} {...props}>
                {children}
              </code>
            );
          },
          a({node, href, children, ...props}: any) {
            // Check if it's an artifact/file link
            if (href?.startsWith('file://')) {
              return (
                <Tooltip content={href}><button
                    onClick={(e) => {
                      e.preventDefault();
                      if (onArtifactClick) {
                        // Strip file:/// and #anchor
                        const rawPath = href.replace('file:///', '').split('#')[0];
                        // Normalize slashes
                        const path = rawPath.replace(/\\/g, '/');
                        onArtifactClick(path);
                      }
                    }}
                    className="text-blue-400 hover:underline inline-flex items-center gap-1 bg-blue-500/10 px-1.5 rounded-sm cursor-pointer">
                    {children}
                  </button></Tooltip>
              );
            }
            return <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
          }
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}


import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../App';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  onArtifactClick?: (path: string) => void;
}

export function MarkdownRenderer({ content, isStreaming, onArtifactClick }: MarkdownRendererProps) {
  // If streaming, append a blinking cursor
  const displayContent = isStreaming ? `${content} ▍` : content;

  return (
    <div className="prose prose-invert max-w-none prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-white/10 prose-p:leading-relaxed prose-a:text-blue-400 text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (!inline && language) {
              return (
                <div className="relative group my-4">
                  <div className="absolute top-2 right-2 text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    {language}
                  </div>
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={language}
                    PreTag="div"
                    className="rounded-md !m-0 !mt-0 !mb-0"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            
            // Inline code
            return (
              <code className={cn("bg-white/10 px-1.5 py-0.5 rounded-md font-mono text-sm text-pink-300", className)} {...props}>
                {children}
              </code>
            );
          },
          a({node, href, children, ...props}: any) {
            // Check if it's an artifact/file link
            if (href?.startsWith('file://')) {
              return (
                <button 
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
                  className="text-blue-400 hover:underline inline-flex items-center gap-1 bg-blue-500/10 px-1.5 rounded-sm cursor-pointer"
                  title={href}
                >
                  {children}
                </button>
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

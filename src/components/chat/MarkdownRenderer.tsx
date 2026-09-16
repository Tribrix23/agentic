import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Copy, Check, ChevronDown, ChevronRight, Download, Globe, Puzzle } from 'lucide-react';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../App';
import { CodeBlock } from './CodeBlock';
import { GmailEmailPreview } from './GmailEmailPreview';
import { GithubPreview } from './GithubPreview';

import { Tooltip } from "../ui/Tooltip";
import { Citation } from "../ui/Citation";

function extractText(children: any): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children?.props?.children) return extractText(children.props.children);
  return '';
}

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


function preprocessGithubBlocks(text: string): string {
  const userRegex = /@([a-zA-Z0-9_-]+)\n- GitHub: \[?(https:\/\/github\.com\/[^\s\]\)]+)\]?.*\n- User ID: ([0-9]+)\n- Avatar: \[?(https:\/\/avatars\.githubusercontent\.com\/[^\s\]\)]+)\]?.*(\n- .*)*\n?/g;
  let result = text.replace(userRegex, (match, username, url, id, avatar) => {
    return `\n\n\`\`\`github-user\n{"login":"${username}","html_url":"${url}","id":${id},"avatar_url":"${avatar}"}\n\`\`\`\n\n`;
  });
  return result;
}

function preprocessEmailBlocks(text: string): string {
  // Finds: From: or To: ... Subject: ... followed by body
  const regex = /(?:^|\n)(?:---\n)?(?:\*\*?)?(From|To):(?:\*\*?)?\s+(.+?)\s+(?:\*\*?)?Subject:(?:\*\*?)?\s+(.+?)\n+([\s\S]*?)(?=\n+---|(?:\n\n)?(?:\*\*|⚠️\s*)?Note:|$)/gi;
  return text.replace(regex, (match, typePart, emailPart, subjectPart, bodyPart) => {
    const cleanType = typePart.trim();
    const cleanEmail = emailPart.replace(/\*/g, '').trim();
    const cleanSubject = subjectPart.replace(/\*/g, '').trim();
    const cleanBody = bodyPart.replace(/^>\s?/gm, '');
    return `\n\n\`\`\`email\n${cleanType}: ${cleanEmail}\nSubject: ${cleanSubject}\n\n${cleanBody}\n\`\`\`\n\n`;
  });
}


const MCP_ALIASES = [
  { trigger: '@github', id: 'github', name: 'GitHub', icon: './github.png' },
  { trigger: '@vercel', id: 'vercel', name: 'Vercel', icon: './vercel.png' },
  { trigger: '@figma', id: 'figma', name: 'Figma', icon: './figma.png' },
  { trigger: '@drive', id: 'gdrive', name: 'Drive', icon: './drive.png' },
  { trigger: '@google drive', id: 'gdrive', name: 'Drive', icon: './drive.png' },
  { trigger: '@supabase', id: 'supabase', name: 'Supabase', icon: './supabase.png' },
  { trigger: '@gmail', id: 'gmail', name: 'Gmail', icon: './gmail.png' },
  { trigger: '@mail', id: 'gmail', name: 'Gmail', icon: './gmail.png' },
  { trigger: '@web', id: 'playwright', name: 'Web', icon: './browser.png' },
  { trigger: '@browser', id: 'playwright', name: 'Web', icon: './browser.png' }
];

function processText(text: string, connectedIds: string[]): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    
    const aliases = [...MCP_ALIASES].sort((a, b) => b.trigger.length - a.trigger.length);
    
    if (aliases.length === 0) return [text];

    
    // We use a simple regex split since lookbehinds are supported in modern browsers
    // but just in case, we'll do a simpler regex and check boundaries manually.
    const triggerRegex = new RegExp(`(?<=^|\\s)(${aliases.map(a => a.trigger).join('|').replace(/ /g, '\\s')})(?=\\s|$)`, 'gi');
    
    let match;
    let lastIndex = 0;
    
    while ((match = triggerRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        
        const trigger = match[1];
        const alias = aliases.find(a => a.trigger.toLowerCase() === trigger.toLowerCase());
        
        if (alias) {
            parts.push(
                <span key={match.index} className="inline-flex items-center gap-1.5 px-0.5 mx-0.5 text-[14px] align-middle select-none bg-transparent whitespace-nowrap">
                    <img src={alias.icon} alt={alias.name} className={`w-4 h-4 object-contain inline-block ${(alias.id === "github" || alias.id === "vercel") ? "filter invert opacity-90" : ""}`} />
                    <span className="text-[#4b93ff] font-medium">{alias.name}</span>
                </span>
            );
        } else {
            parts.push(trigger);
        }
        
        lastIndex = match.index + trigger.length;
    }
    
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? parts : [text];
}

function processChildren(children: React.ReactNode, connectedIds: string[]): React.ReactNode {
    if (typeof children === 'string') {
        return processText(children, connectedIds);
    }
    if (Array.isArray(children)) {
        return children.map((child, i) => <React.Fragment key={i}>{processChildren(child, connectedIds)}</React.Fragment>);
    }
    return children;
}

export function MarkdownRenderer({ content, isStreaming, onArtifactClick }: MarkdownRendererProps) {
  const [connectedIds, setConnectedIds] = React.useState<string[]>([]);
  React.useEffect(() => {
    let timeoutId: any;
    let mounted = true;
    const check = async () => {
      try {
        const servers = (await (window as any).electron?.mcp?.getServers?.()) || [];
        if (mounted) {
          setConnectedIds(servers.filter((s: any) => s.connected).map((s: any) => s.id));
          timeoutId = setTimeout(check, 5000);
        }
      } catch (e) {
        if (mounted) timeoutId = setTimeout(check, 5000);
      }
    };
    check();
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // If streaming, append a blinking cursor
  const rawContent = isStreaming ? `${content} ▍` : content;
  let processedEmailContent = preprocessEmailBlocks(rawContent);
    processedEmailContent = preprocessGithubBlocks(processedEmailContent);
  const displayContent = preprocessMath(processedEmailContent);

  return (
    <div className="prose prose-invert max-w-none w-full min-w-0 prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-white/10 prose-p:leading-relaxed prose-a:text-blue-400 text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, { throwOnError: false, output: 'html' }]]}
        components={{
          h1: ({ children }) => <h1 className="text-xl leading-7 font-semibold text-white mb-4 last:mb-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mt-7 mb-3 pb-2 border-b border-white/10 last:mb-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-violet-200 mt-5 mb-2 last:mb-0">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0 text-inherit leading-relaxed">{processChildren(children, connectedIds)}</p>,
          ul: ({ children }) => <ul className="mb-4 pl-5 list-disc space-y-1 marker:text-violet-400 last:mb-0">{processChildren(children, connectedIds)}</ul>,
          ol: ({ children }) => <ol className="mb-4 pl-5 list-decimal space-y-1 marker:text-violet-400 last:mb-0">{processChildren(children, connectedIds)}</ol>,
          table: ({ children }) => <div className="my-4 last:mb-0 overflow-x-auto rounded-lg border border-white/10"><table className="w-full min-w-[420px] border-collapse text-left text-xs">{children}</table></div>,
          thead: ({ children }) => <thead className="bg-white/5 text-white">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 font-medium border-b border-white/10">{processChildren(children, connectedIds)}</th>,
          td: ({ children }) => <td className="px-3 py-2 align-top border-b border-white/5 text-inherit">{processChildren(children, connectedIds)}</td>,
          blockquote: ({ children }) => {
            const text = extractText(children);
            if (text.includes('From:') && text.includes('Subject:')) {
              return <GmailEmailPreview content={text} />;
            }
            return <blockquote className="my-4 last:mb-0 border-l-2 border-violet-500 pl-3 text-inherit opacity-80">{children}</blockquote>;
          },
          a: ({ href, title, children, ...props }) => {
            const text = String(children);
            // Simple heuristic: if text is short (like a domain, a number, or short acronym)
            // and it has an href, it's a citation pill.
            const isCitation = text.length > 0 && text.length <= 40 && href?.startsWith('http');
            
            if (isCitation) {
              return <Citation href={href!} title={title} text={text} />;
            }
            
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
            return <a href={href} title={title} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
          },
          span({node, className, children, ...props}: any) {
            if (props['data-agentic-chip']) {
              const name = props['data-name'];
              const type = props['data-type'];
              const isBrowser = name === 'playwright' || name === 'mcp__playwright';
              const displayName = isBrowser ? 'Browser' : name.replace('mcp__', '').replace(/__/g, ' ');
              return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[12px] font-medium text-white shadow-sm shrink-0 h-[26px] align-text-bottom mr-1.5" style={{ transform: 'translateY(-1px)' }}>
                  <span className="opacity-70 flex items-center justify-center">
                    {isBrowser ? <Globe size={14} className="text-blue-400" /> : <Puzzle size={14} className={type === 'skill' ? "text-orange-400" : "text-purple-400"} />}
                  </span>
                  <span className="leading-none">{displayName}</span>
                </span>
              );
            }
            return <span className={className} {...props}>{children}</span>;
          },
          code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            
            if (!inline && language) {
              
                if (language === 'github-user') {
                  let parsed: any = { items: [] };
                  try {
                    parsed.items = [JSON.parse(String(children).replace(/\n$/, ''))];
                  } catch (e) {}
                  return <GithubPreview toolName="mcp_github_search_users" args={{q: parsed.items[0]?.login}} output={JSON.stringify(parsed)} isRunning={false} isError={false} />;
                }

                if (language === 'email') {
                return <GmailEmailPreview content={String(children).replace(/\n$/, '')} />;
              }
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
          }
        }}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
}


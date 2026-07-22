import React from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

// A simple custom markdown parser per prompt constraints
export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  // We'll split the content into basic blocks (code blocks vs text blocks)
  const renderBlocks = () => {
    const blocks: React.ReactNode[] = [];
    const lines = content.split('\n');
    
    let inCodeBlock = false;
    let codeContent = '';
    let codeLanguage = '';
    
    let currentTextBlock: string[] = [];
    
    const flushText = () => {
      if (currentTextBlock.length > 0) {
        blocks.push(
          <div key={blocks.length} className="mb-2 last:mb-0 space-y-2">
            {renderInlineMarkdown(currentTextBlock.join('\n'))}
          </div>
        );
        currentTextBlock = [];
      }
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          blocks.push(
            <CodeBlock 
              key={blocks.length} 
              code={codeContent.trimEnd()} 
              language={codeLanguage} 
            />
          );
          codeContent = '';
          codeLanguage = '';
        } else {
          flushText();
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
        }
      } else {
        if (inCodeBlock) {
          codeContent += line + '\n';
        } else {
          currentTextBlock.push(line);
        }
      }
    }
    
    if (inCodeBlock) {
      blocks.push(
        <CodeBlock 
          key={blocks.length} 
          code={codeContent} 
          language={codeLanguage} 
        />
      );
    } else {
      flushText();
    }
    
    return blocks;
  };
  
  const renderInlineMarkdown = (text: string) => {
    // Simple inline parsing returning dangerous HTML for simplicity within React constraint
    let html = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-5 mb-3 border-b border-white/10 pb-1">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 border-b border-white/20 pb-2">$1</h1>');
    
    // Bold, Italic, Strikethrough, Inline Code
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
    html = html.replace(/`(.*?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded font-mono text-sm text-pink-300">$1</code>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline">$1</a>');
    
    // Lists (naive)
    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4 list-disc">$1</li>');
    html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li class="ml-4 list-decimal">$1</li>');
    
    // Blockquotes
    html = html.replace(/^>\s+(.*)$/gim, '<blockquote class="border-l-2 border-white/20 pl-4 py-1 text-white/70 italic">$1</blockquote>');
    
    // Wrap loose text lines in paragraphs (simple heuristic)
    // Here we just use line breaks for simplicity in the basic parser
    html = html.replace(/\n/g, '<br/>');
    
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="font-sans leading-relaxed text-[15px]">
      {renderBlocks()}
      {isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-white animate-pulse" />}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { cn } from '../../App';

interface ArtifactViewerProps {
  artifactPath: string;
  onClose: () => void;
  onProceed?: (message: string) => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifactPath, onClose, onProceed }) => {
  const [content, setContent] = useState<string>('Loading artifact...');
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);

  useEffect(() => {
    const loadFile = async () => {
      try {
        const result = await (window as any).electron.readFileContent(artifactPath);
        if (typeof result === 'string' && result.startsWith('Error reading file:')) {
          setError(result);
        } else {
          setContent(result);
        }
        
        // Try to load metadata
        try {
          const metaResult = await (window as any).electron.readFileContent(`${artifactPath}.meta.json`);
          if (typeof metaResult === 'string' && !metaResult.startsWith('Error')) {
            setMetadata(JSON.parse(metaResult));
          }
        } catch (e) {
          // Ignore missing metadata
        }
      } catch (e: any) {
        setError(`Failed to load artifact: ${e.message}`);
      }
    };
    loadFile();
  }, [artifactPath]);

  // Custom component for blockquotes to render GitHub-style alerts
  const CustomBlockquote = ({ node, children, ...props }: any) => {
    // Check if the blockquote contains a GitHub alert like [!NOTE]
    const text = children?.[1]?.props?.children?.[0] || '';
    if (typeof text === 'string') {
      const isNote = text.startsWith('[!NOTE]');
      const isTip = text.startsWith('[!TIP]');
      const isImportant = text.startsWith('[!IMPORTANT]');
      const isWarning = text.startsWith('[!WARNING]');
      const isCaution = text.startsWith('[!CAUTION]');

      if (isNote || isTip || isImportant || isWarning || isCaution) {
        let type = 'note';
        let Icon = Info;
        let colorClass = 'border-blue-500 bg-blue-500/10 text-blue-200';
        let titleStr = 'Note';
        
        if (isNote) { titleStr = 'Note'; type = 'note'; }
        if (isTip) { titleStr = 'Tip'; type = 'tip'; Icon = CheckCircle; colorClass = 'border-green-500 bg-green-500/10 text-green-200'; }
        if (isImportant) { titleStr = 'Important'; type = 'important'; Icon = Info; colorClass = 'border-purple-500 bg-purple-500/10 text-purple-200'; }
        if (isWarning) { titleStr = 'Warning'; type = 'warning'; Icon = AlertTriangle; colorClass = 'border-yellow-500 bg-yellow-500/10 text-yellow-200'; }
        if (isCaution) { titleStr = 'Caution'; type = 'caution'; Icon = AlertOctagon; colorClass = 'border-red-500 bg-red-500/10 text-red-200'; }

        // Remove the [!TYPE] text from the content
        const cleanedChildren = React.Children.map(children, (child: any, index: number) => {
          if (index === 1 && child.props && child.props.children) {
            const firstText = child.props.children[0];
            if (typeof firstText === 'string') {
              return React.cloneElement(child, {
                children: [
                  firstText.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, ''),
                  ...child.props.children.slice(1)
                ]
              });
            }
          }
          return child;
        });

        return (
          <div className={cn("my-4 border-l-4 p-4 rounded-r-md", colorClass)}>
            <div className="flex items-center gap-2 font-bold mb-2">
              <Icon size={18} />
              <span>{titleStr}</span>
            </div>
            <div className="text-sm">
              {cleanedChildren}
            </div>
          </div>
        );
      }
    }
    
    return <blockquote className="border-l-4 border-zinc-600 pl-4 py-1 my-4 italic text-zinc-400" {...props}>{children}</blockquote>;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border-l border-white/5 w-full max-w-[600px] shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="text-white font-medium text-sm truncate">
          Artifact: {artifactPath.split(/[/\\]/).pop()}
        </h3>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-md transition-colors"
        >
          <X size={16} className="text-zinc-400 hover:text-white" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 scrollbar-custom">
        {error ? (
          <div className="text-red-400 p-4 bg-red-500/10 rounded-md border border-red-500/20">
            {error}
          </div>
        ) : (
          <div className="prose prose-invert max-w-none prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-white/10 prose-a:text-blue-400">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                code({node, inline, className, children, ...props}: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const language = match ? match[1] : '';
                  
                  if (!inline && language) {
                    return (
                      <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={language}
                        PreTag="div"
                        className="rounded-md !mt-0 !mb-0"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  }
                  
                  return (
                    <code className={cn("bg-white/10 px-1.5 py-0.5 rounded-md text-sm", className)} {...props}>
                      {children}
                    </code>
                  );
                },
                blockquote: CustomBlockquote
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      
      {metadata?.requestFeedback && (
        <div className="p-4 border-t border-white/5 bg-[#121214] flex flex-col items-center">
          <button
            onClick={() => onProceed && onProceed("Looks good! Proceed with the plan.")}
            className="w-full max-w-[200px] py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors shadow-lg"
          >
            Approve & Proceed
          </button>
          <p className="text-zinc-500 text-xs mt-2 text-center">
            Review the plan above. If you'd like changes, you can type them in the chat.
          </p>
        </div>
      )}
    </div>
  );
};

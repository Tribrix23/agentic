import React, { useState } from 'react';
import { Terminal, Check } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface ToolApprovalCardProps {
  toolCall: any;
  onDecision: (approved: boolean, feedback?: string) => void;
  onSkip?: () => void;
}

type ApprovalChoice = 
  | 'allow_once' 
  | 'allow_project' 
  | 'allow_always' 
  | 'reject_feedback';

export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({ 
  toolCall, 
  onDecision,
  onSkip
}) => {
  const [selectedChoice, setSelectedChoice] = useState<ApprovalChoice>('allow_once');
  const [feedback, setFeedback] = useState('');

  // Format arguments for display as a sentence
  let argsDisplay = '';
  try {
    let parsed: any = {};
    if (typeof toolCall.arguments === 'string') {
      parsed = JSON.parse(toolCall.arguments);
    } else if (typeof toolCall.arguments === 'object') {
      parsed = toolCall.arguments;
    }

    const name = toolCall.name || '';
    
    if (name === 'renameFile' || name === 'rename_file') {
      argsDisplay = `Rename ${parsed.path || parsed.source} to ${parsed.newPath || parsed.destination}.`;
    } else if (name === 'deleteFile' || name === 'delete_file') {
      argsDisplay = `Delete file at ${parsed.path || parsed.targetFile}.`;
    } else if (name === 'runCommand' || name === 'run_command') {
      argsDisplay = `Execute command: \`${parsed.command || parsed.commandLine}\`.`;
    } else if (name === 'writeFile' || name === 'write_file' || name === 'write_to_file') {
      argsDisplay = `Write content to file at ${parsed.targetFile || parsed.path}.`;
    } else if (name === 'editFile' || name === 'edit_file' || name === 'replace_file_content' || name === 'multi_replace_file_content') {
      argsDisplay = `Edit file at ${parsed.targetFile || parsed.path}.`;
    } else if (parsed.command || parsed.commandLine) {
      argsDisplay = `Execute command: \`${parsed.command || parsed.commandLine}\`.`;
    } else {
      // Fallback generic sentence
      const keys = Object.keys(parsed);
      if (keys.length > 0) {
        const details = keys.map(k => {
          let val = parsed[k];
          if (typeof val === 'string' && val.length > 50) val = val.substring(0, 47) + '...';
          return `${k} = ${JSON.stringify(val)}`;
        }).join(', ');
        argsDisplay = `Execute ${name} with ${details}.`;
      } else {
        argsDisplay = `Execute ${name} with no arguments.`;
      }
    }
  } catch (e) {
    argsDisplay = `Execute ${toolCall.name || 'tool'} with raw arguments: ${toolCall.arguments}`;
  }

  const handleSubmit = () => {
    if (selectedChoice === 'reject_feedback') {
      onDecision(false, feedback);
    } else {
      // In the future, allow_project and allow_always could save to permissions.
      // For now, they all just approve this execution.
      onDecision(true);
    }
  };

  const toolName = toolCall.name || 'tool';

  return (
    <div className="flex flex-col gap-2 relative w-full mx-auto max-w-[750px]">
      <div className="w-full bg-[#1c1c21] border border-white/5 rounded-2xl p-4 flex flex-col shadow-2xl pointer-events-auto">
        {/* Header */}
        <div className="flex items-center gap-2 text-[#e2e2e3] font-semibold text-[14px] mb-3">
          <Terminal size={16} className="text-[#8b8b93]" />
          <span>Allow run {toolName}?</span>
        </div>

        {/* Code Snippet */}
        <div className="bg-[#0f0f13] border border-white/5 rounded-lg p-3 overflow-x-auto mb-4 custom-scrollbar max-h-[150px]">
          <pre className="text-[13px] text-[#e2e2e3] font-mono whitespace-pre-wrap word-break-all">
            {argsDisplay}
          </pre>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-1.5 mb-4">
          <button
            onClick={() => setSelectedChoice('allow_once')}
            className={cn(
              "flex items-center gap-3 w-full p-2.5 rounded-lg text-left text-[13px] transition-colors border",
              selectedChoice === 'allow_once' 
                ? "bg-white/10 border-white/10 text-white" 
                : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">1</div>
            <span className="flex-1">Yes, allow this time</span>
          </button>

          <button
            onClick={() => setSelectedChoice('allow_project')}
            className={cn(
              "flex items-center gap-3 w-full p-2.5 rounded-lg text-left text-[13px] transition-colors border",
              selectedChoice === 'allow_project' 
                ? "bg-white/10 border-white/10 text-white" 
                : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">2</div>
            <span className="flex-1">Yes, and always allow in this project</span>
          </button>

          <button
            onClick={() => setSelectedChoice('allow_always')}
            className={cn(
              "flex items-center gap-3 w-full p-2.5 rounded-lg text-left text-[13px] transition-colors border",
              selectedChoice === 'allow_always' 
                ? "bg-white/10 border-white/10 text-white" 
                : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">3</div>
            <span className="flex-1">Yes, and always allow</span>
          </button>

          <button
            onClick={() => setSelectedChoice('reject_feedback')}
            className={cn(
              "flex items-center gap-3 w-full p-2.5 rounded-lg text-left text-[13px] transition-colors border",
              selectedChoice === 'reject_feedback' 
                ? "bg-white/10 border-white/10 text-white" 
                : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">4</div>
            <span className="flex-1">No <span className="text-[#8b8b93]">(tell the agent what to do instead)</span></span>
          </button>
        </div>

        {/* Feedback Input (if rejected) */}
        {selectedChoice === 'reject_feedback' && (
          <div className="mb-4 animate-fade-in">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What should the agent do instead?"
              className="w-full bg-[#0f0f13] border border-white/10 rounded-lg p-3 text-[13px] text-white outline-none focus:border-[#007acc] transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && feedback.trim()) {
                  handleSubmit();
                }
              }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-1">
          {onSkip && (
            <button
              onClick={onSkip}
              className="px-4 py-2 text-[13px] font-semibold text-[#8b8b93] hover:text-white transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={selectedChoice === 'reject_feedback' && !feedback.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit
            <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

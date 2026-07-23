import React, { useState } from 'react';
import { AgentStep, AgentProgressCard } from './AgentProgressCard';
import { ChevronDown, ChevronRight, RefreshCw, CheckCircle2 } from 'lucide-react';

interface AgentStepsGroupProps {
  steps: AgentStep[];
  isStreaming?: boolean;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
}

export function AgentStepsGroup({ steps, isStreaming, onApproveToolCall, onRejectToolCall }: AgentStepsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!steps || steps.length === 0) return null;

  const isRunning = steps.some(s => s.status === 'running') || isStreaming;
  const headerText = isRunning ? 'Working...' : 'Finished';

  // Build nested structure: Thinking -> Tools (siblings within an iteration)
  type Segment =
    | { kind: 'iteration'; thinking: AgentStep; tools: AgentStep[] };

  const segments: Segment[] = [];
  let currentThinking: AgentStep | null = null;
  let currentTools: AgentStep[] = [];

  for (const step of steps) {
    if (step.type === 'thinking') {
      // Flush previous thinking with its tools
      if (currentThinking) {
        segments.push({ kind: 'iteration', thinking: currentThinking, tools: [...currentTools] });
        currentTools = [];
      }
      currentThinking = step;
    } else if (step.type === 'tool') {
      currentTools.push(step);
    }
  }
  // Flush the last thinking with its tools
  if (currentThinking) {
    segments.push({ kind: 'iteration', thinking: currentThinking, tools: currentTools });
  } else if (currentTools.length > 0) {
    // Fallback: If tools were called without any prior thinking block
    segments.push({ 
      kind: 'iteration', 
      thinking: { id: 'fallback-think', type: 'thinking', status: 'completed', content: '' }, 
      tools: currentTools 
    });
  }

  return (
    <div className="w-full max-w-2xl mt-2 mb-2 font-sans text-sm">
      {/* Top Level Working... / Finished accordion */}
      <div
        className="flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/70 hover:text-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="text-white/40 group-hover:text-white/70 transition-colors">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <span className={isRunning ? 'shimmer-text font-medium' : 'font-medium'}>
          {headerText}
        </span>
      </div>

      {/* Inner Content - Array of Iterations */}
      {isExpanded && (
        <div className="ml-5 mt-1 border-l border-white/10 pl-3 flex flex-col gap-2">
          {segments.map((seg, segIdx) => (
            <IterationBlock
              key={seg.thinking.id}
              thinkingStep={seg.thinking}
              toolSteps={seg.tools}
              isStreaming={!!isStreaming}
              isLastSegment={segIdx === segments.length - 1}
              onApproveToolCall={onApproveToolCall}
              onRejectToolCall={onRejectToolCall}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Iteration block (Thought -> Tools -> Review) ──────────────────────────

interface IterationBlockProps {
  thinkingStep: AgentStep;
  toolSteps: AgentStep[];
  isStreaming: boolean;
  isLastSegment: boolean;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
}

function IterationBlock({ 
  thinkingStep, 
  toolSteps, 
  isStreaming, 
  isLastSegment,
  onApproveToolCall, 
  onRejectToolCall 
}: IterationBlockProps) {
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(true);

  const isThinkingRunning = thinkingStep.status === 'running';
  const hasTools = toolSteps.length > 0;
  
  return (
    <div className="flex flex-col gap-1">
      {/* Thought row */}
      <div className="flex flex-col">
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/70 hover:text-white"
          onClick={() => setThoughtExpanded(!thoughtExpanded)}
        >
          <div className="text-white/40 group-hover:text-white/70 transition-colors">
            {thoughtExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          <span className={isThinkingRunning ? 'shimmer-text' : ''}>
            Thought
          </span>
        </div>
        {thoughtExpanded && (
          <div className="ml-5 mt-1 border-l border-white/10 pl-3 py-1 text-white/60 whitespace-pre-wrap">
             {thinkingStep.content || 'Thinking...'}
          </div>
        )}
      </div>

      {/* Tools row */}
      {hasTools && (
        <ToolGroupBlock
          steps={toolSteps}
          isStreaming={isStreaming && isLastSegment}
          expanded={toolsExpanded}
          onToggle={() => setToolsExpanded(!toolsExpanded)}
          onApproveToolCall={onApproveToolCall}
          onRejectToolCall={onRejectToolCall}
        />
      )}


    </div>
  );
}

// ── Collapsible block for a group of tool calls ───────────────────────────

interface ToolGroupBlockProps {
  steps: AgentStep[];
  isStreaming: boolean;
  expanded: boolean;
  onToggle: () => void;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
}

function ToolGroupBlock({ steps, isStreaming, expanded, onToggle, onApproveToolCall, onRejectToolCall }: ToolGroupBlockProps) {
  const isRunning = steps.some(s => s.status === 'running') || isStreaming;
  const count = steps.length;
  const label = isRunning ? 'Tool call...' : (count === 1 ? 'Ran 1 tool' : `Ran ${count} tools`);

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/70 hover:text-white"
        onClick={onToggle}
      >
        <div className="text-white/40 group-hover:text-white/70 transition-colors">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <span className={isRunning ? 'shimmer-text' : ''}>{label}</span>
      </div>

      {expanded && (
        <div className="ml-5 mt-1 border-l border-white/10 pl-3 flex flex-col gap-1">
          {steps.map(step => (
            <AgentProgressCard
              key={step.id}
              step={step}
              onApprove={onApproveToolCall}
              onReject={onRejectToolCall}
            />
          ))}
        </div>
      )}
    </div>
  );
}

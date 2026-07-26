import React, { useState, useEffect } from 'react';
import { AgentStep, AgentProgressCard } from './AgentProgressCard';
import { ChevronDown, ChevronRight, RefreshCw, Check, SquareTerminal, Brain, Activity } from 'lucide-react';

interface AgentStepsGroupProps {
  steps: AgentStep[];
  isStreaming?: boolean;
  isWorking?: boolean;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
  onArtifactClick?: (path: string) => void;
}

function AccordionIcon({ isExpanded, icon: Icon, colorClass = "text-white" }: { isExpanded: boolean, icon: React.ElementType, colorClass?: string }) {
  return (
    <div className={`relative w-4 h-4 flex items-center justify-center transition-colors ${colorClass}`}>
      <div className="absolute inset-0 transition-opacity duration-200 opacity-100 group-hover:opacity-0 flex items-center justify-center">
        <Icon size={14} />
      </div>
      <div className="absolute inset-0 transition-opacity duration-200 opacity-0 group-hover:opacity-100 flex items-center justify-center">
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>
    </div>
  );
}

export function AgentStepsGroup({ steps, isStreaming, isWorking, onApproveToolCall, onRejectToolCall, onArtifactClick }: AgentStepsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isRunning = isWorking || steps.some(s => s.status === 'running') || isStreaming;

  useEffect(() => {
    if (!isRunning) {
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  }, [isRunning]);

  if ((!steps || steps.length === 0) && !isRunning) return null;

  const headerText = isRunning ? 'Working...' : 'Finished';
  const HeaderIcon = isRunning ? Activity : Check;

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
      {!isRunning ? (
        <>
          <div
            className="flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/60 hover:text-white/80"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <AccordionIcon isExpanded={isExpanded} icon={Check} />
            <span className="font-medium">Agent Activity</span>
          </div>
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
                  onArtifactClick={onArtifactClick}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 pl-3">
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
          {/* Append Working... if needed */}
          {isWorking && !steps.some(s => s.status === 'running') && !isStreaming && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 py-1.5 px-2 rounded-md text-white/60">
                <div className="w-4 h-4 flex items-center justify-center">
                  <Activity size={14} />
                </div>
                <span className="shimmer-text font-medium">Working...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Iteration block (Thought -> Tools) ──────────────────────────

interface IterationBlockProps {
  thinkingStep: AgentStep;
  toolSteps: AgentStep[];
  isStreaming: boolean;
  isLastSegment: boolean;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
  onArtifactClick?: (path: string) => void;
}

function IterationBlock({ 
  thinkingStep, 
  toolSteps, 
  isStreaming, 
  isLastSegment,
  onApproveToolCall, 
  onRejectToolCall,
  onArtifactClick 
}: IterationBlockProps) {
  const isThinkingRunning = thinkingStep.status === 'running';
  const hasTools = toolSteps.length > 0;

  const hasRunningTool = toolSteps.some(s => s.status === 'running');
  
  const [thoughtExpanded, setThoughtExpanded] = useState(isThinkingRunning);
  const [toolsExpanded, setToolsExpanded] = useState(hasRunningTool);
  
  useEffect(() => {
    setThoughtExpanded(isThinkingRunning);
  }, [isThinkingRunning]);

  useEffect(() => {
    setToolsExpanded(hasRunningTool);
  }, [hasRunningTool]);
  
  return (
    <div className="flex flex-col gap-1">
      {/* Thought row */}
      {(thinkingStep.content || isThinkingRunning) && (
        <div className="flex flex-col">
          <div
            className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/60 hover:text-white/80"
            onClick={() => setThoughtExpanded(!thoughtExpanded)}
          >
            <AccordionIcon isExpanded={thoughtExpanded} icon={Brain} />
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
      )}

      {/* Tools row */}
      {hasTools && (
        toolSteps.length === 1 ? (
          <div className="flex flex-col px-2">
            <AgentProgressCard
              key={toolSteps[0].id}
              step={toolSteps[0]}
              onApprove={onApproveToolCall}
              onReject={onRejectToolCall}
              onArtifactClick={onArtifactClick}
            />
          </div>
        ) : (
          <ToolGroupBlock
            steps={toolSteps}
            isStreaming={isStreaming && isLastSegment}
            expanded={toolsExpanded}
            onToggle={() => setToolsExpanded(!toolsExpanded)}
            onApproveToolCall={onApproveToolCall}
            onRejectToolCall={onRejectToolCall}
            onArtifactClick={onArtifactClick}
          />
        )
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
  onArtifactClick?: (path: string) => void;
}

function ToolGroupBlock({ steps, isStreaming, expanded, onToggle, onApproveToolCall, onRejectToolCall, onArtifactClick }: ToolGroupBlockProps) {
  const isRunning = steps.some(s => s.status === 'running') || isStreaming;
  const count = steps.length;
  const label = isRunning ? 'Tool call...' : `Ran ${count} tools`;

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/60 hover:text-white/80"
        onClick={onToggle}
      >
        <AccordionIcon isExpanded={expanded} icon={SquareTerminal} />
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
              onArtifactClick={onArtifactClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

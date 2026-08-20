import React, { useState, useEffect, useRef } from 'react';
import { AgentStep, AgentProgressCard } from './AgentProgressCard';
import { ChevronDown, ChevronRight, RefreshCw, Check, SquareTerminal, Brain, Activity } from 'lucide-react';
import { AgentState } from '../../lib/types/AgentTypes';
import { getAgentWaitingLabel, isAgentWaiting } from '../../lib/agentPresentation';

interface AgentStepsGroupProps {
  steps: AgentStep[];
  isStreaming?: boolean;
  isWorking?: boolean;
  agentState?: AgentState;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
  onArtifactClick?: (path: string) => void;
}

// ── Cycling word swapper (bottom-to-top motion blur) ─────────────
const WORKING_WORDS = [
  'Working...',
  'Analyzing...',
  'Thinking...',
  'Processing...',
  'Reasoning...',
  'Planning...',
];

function CyclingWord() {
  const [index, setIndex] = useState(0);
  // `tick` increments each time we swap words; used as CSS animation restart key
  const [tick, setTick] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Schedule the exit after 8 seconds of showing the current word
    exitTimer.current = setTimeout(() => {
      setIsExiting(true);
      // After exit animation (~380ms), swap to next word and re-enter
      swapTimer.current = setTimeout(() => {
        setIndex(i => (i + 1) % WORKING_WORDS.length);
        setTick(t => t + 1);
        setIsExiting(false);
      }, 420);
    }, 8000);

    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      if (swapTimer.current) clearTimeout(swapTimer.current);
    };
  }, [tick]);

  // NOTE: shimmer-text uses -webkit-text-fill-color:transparent + background-clip:text.
  // Applying filter:blur() on the same element breaks the gradient clip.
  // Fix: outer span handles transform+blur, inner span carries shimmer.
  return (
    <span
      key={tick}
      className={`font-medium inline-block ${isExiting ? 'word-exit' : 'word-enter'}`}
      style={{ willChange: 'transform, opacity, filter' }}
    >
      <span className="shimmer-text">{WORKING_WORDS[index]}</span>
    </span>
  );
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

export function AgentStepsGroup({ steps, isStreaming, isWorking, agentState, onApproveToolCall, onRejectToolCall, onArtifactClick }: AgentStepsGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isWaiting = isAgentWaiting(agentState);
  const isRunning = !isWaiting && (isWorking || steps.some(s => s.status === 'running') || isStreaming);

  useEffect(() => {
    if (!isRunning) {
      setIsExpanded(false);
    } else {
      setIsExpanded(true);
    }
  }, [isRunning]);

  if ((!steps || steps.length === 0) && !isRunning && !isWaiting) return null;

  const headerText = isWaiting ? getAgentWaitingLabel(agentState) : isRunning ? 'Working...' : 'Finished';
  const HeaderIcon = isWaiting ? Activity : isRunning ? Activity : Check;

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
    <div className="w-full mt-2 mb-2 font-sans text-sm">
      {isWaiting ? (
        <div className="flex flex-col gap-2 pl-3">
          <div className="flex items-center gap-2 py-1.5 px-2 rounded-md text-amber-300/80">
            <Activity size={14} />
            <span className="font-medium">{headerText}</span>
          </div>
          {segments.length > 0 && (
            <div className="ml-2 pl-3 flex flex-col gap-2 opacity-70">
              {segments.map((seg, segIdx) => (
                <IterationBlock key={seg.thinking.id} thinkingStep={seg.thinking} toolSteps={seg.tools} isStreaming={!!isStreaming} isLastSegment={segIdx === segments.length - 1} onApproveToolCall={onApproveToolCall} onRejectToolCall={onRejectToolCall} onArtifactClick={onArtifactClick} />
              ))}
            </div>
          )}
        </div>
      ) : !isRunning ? (
        <>
          <div
            className="flex items-center gap-2 py-1.5 px-3 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/60 hover:text-white/80"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <AccordionIcon isExpanded={isExpanded} icon={Check} />
            <span className="font-medium">Agent Activity</span>
          </div>
          {isExpanded && (
            <div className="ml-5 mt-1 pl-3 flex flex-col gap-2">
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
          {isWorking && (
            <div className="flex relative w-full min-w-0 group/step">
              <div className="flex items-center gap-2 py-1.5 px-2 rounded-md text-white/60">
                <div className="w-4 h-4 flex items-center justify-center">
                  <Activity size={14} />
                </div>
                <span className="overflow-hidden inline-flex items-center" style={{ minWidth: '8ch' }}>
                  <CyclingWord />
                </span>
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

  // Split content into words for animation
  const content = thinkingStep.content || 'Thinking...';
  const words = content.split(/\s+/);
  
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
              {thinkingStep.agentName ? `${thinkingStep.agentName} Thought` : 'Thought'}
            </span>
          </div>
          {thoughtExpanded && (
              <div className="ml-5 mt-1 pl-3 py-1 text-white/60 leading-relaxed whitespace-pre-wrap">
                {content.split(/(\s+)/).map((token, i) => {
                  if (/^\s+$/.test(token)) {
                    return <React.Fragment key={i}>{token}</React.Fragment>;
                  }
                  return (
                    <span
                      key={i}
                      className="inline-block word-enter"
                      style={{
                        animationDelay: isThinkingRunning ? '0ms' : `${Math.min(i * 10, 600)}ms`,
                        animationFillMode: 'both',
                      }}
                    >
                      {token}
                    </span>
                  );
                })}
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
    <div className="flex flex-col w-full min-w-0">
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/60 hover:text-white/80"
        onClick={onToggle}
      >
        <AccordionIcon isExpanded={expanded} icon={SquareTerminal} />
        <span className={isRunning ? 'shimmer-text' : ''}>{label}</span>
      </div>

      {expanded && (
        <div className="ml-5 mt-1 pl-3 flex flex-col gap-1 w-full min-w-0">
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

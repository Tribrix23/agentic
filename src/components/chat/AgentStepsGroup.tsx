import React, { useState } from 'react';
import { AgentStep, AgentProgressCard } from './AgentProgressCard';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
  const headerText = isRunning ? 'Working...' : 'Finished.';

  // Separate thinking and tool steps
  const toolSteps = steps.filter(s => s.type === 'tool');

  // Build a chronological list of "segments": thinking blocks interleaved with tool groups
  // We walk steps in order and group adjacent tool calls together
  type Segment =
    | { kind: 'thinking'; step: AgentStep }
    | { kind: 'tools'; steps: AgentStep[]; key: string };

  const segments: Segment[] = [];
  let currentToolGroup: AgentStep[] = [];

  for (const step of steps) {
    if (step.type === 'thinking') {
      // Flush any pending tool group first
      if (currentToolGroup.length > 0) {
        segments.push({ kind: 'tools', steps: [...currentToolGroup], key: currentToolGroup[0].id });
        currentToolGroup = [];
      }
      segments.push({ kind: 'thinking', step });
    } else {
      currentToolGroup.push(step);
    }
  }
  // Flush any remaining tools
  if (currentToolGroup.length > 0) {
    segments.push({ kind: 'tools', steps: [...currentToolGroup], key: currentToolGroup[0].id });
  }

  return (
    <div className="w-full max-w-2xl mt-2 mb-2 font-sans text-sm">
      {/* Top Level Working... accordion */}
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

      {/* Inner Content */}
      {isExpanded && (
        <div className="ml-5 mt-1 border-l border-white/10 pl-3 flex flex-col gap-1">
          {segments.map((seg, segIdx) => {
            if (seg.kind === 'thinking') {
              return (
                <AgentProgressCard
                  key={seg.step.id}
                  step={seg.step}
                  onApprove={onApproveToolCall}
                  onReject={onRejectToolCall}
                />
              );
            }

            // Tool group — rendered in a collapsible "Ran N tools" block
            return (
              <ToolGroupBlock
                key={seg.key}
                steps={seg.steps}
                isStreaming={!!isStreaming}
                onApproveToolCall={onApproveToolCall}
                onRejectToolCall={onRejectToolCall}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Collapsible block for a group of sequential tool calls ─────────────────

interface ToolGroupBlockProps {
  steps: AgentStep[];
  isStreaming: boolean;
  onApproveToolCall?: (id: string) => void;
  onRejectToolCall?: (id: string) => void;
}

function ToolGroupBlock({ steps, isStreaming, onApproveToolCall, onRejectToolCall }: ToolGroupBlockProps) {
  const [expanded, setExpanded] = useState(true);

  const isRunning = steps.some(s => s.status === 'running') || isStreaming;
  const count = steps.length;
  const label = count === 1 ? 'Ran 1 tool' : `Ran ${count} tools`;

  return (
    <div className="flex flex-col">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-white/5 transition-colors group text-white/70 hover:text-white"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-white/40 group-hover:text-white/70 transition-colors">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <span className={isRunning ? 'shimmer-text' : ''}>{label}</span>
      </div>

      {/* Tool steps */}
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

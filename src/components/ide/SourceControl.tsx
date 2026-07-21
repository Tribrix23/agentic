import React, { useState, useEffect } from 'react';
import { Plus, Check, RotateCcw, GitBranch, GitCommit, Target, ArrowDownToLine, ArrowDown, ArrowUp, MoreHorizontal, Undo2 } from 'lucide-react';
import { cn } from '../../App';

interface SourceControlProps {
  projectPath?: string;
  onGitAction?: () => void;
  gitStatusMap?: Record<string, string>;
}

interface GitFile {
  status: string;
  path: string;
}

interface GitCommitNode {
  hash: string;
  parents: string[];
  subject: string;
  authorName: string;
  authorRelative: string;
  refs: string[];
}

export interface GraphCommitNode extends GitCommitNode {
  track: number;
  color: string;
  hasIncoming: boolean;
  passThrough: { track: number, color: string }[];
  parentConnections: { targetHash: string, track: number, color: string }[];
}

const COLORS = [
  '#3a71c1', // blue
  '#a855f7', // purple
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#3b82f6', // light blue
  '#ec4899', // pink
  '#14b8a6', // teal
];

const computeGraph = (log: GitCommitNode[]): GraphCommitNode[] => {
  const activeBranches: { hash: string, track: number, color: string }[] = [];
  
  return log.map((commit) => {
    const activeIn = [...activeBranches];
    let branchIdx = activeBranches.findIndex(b => b.hash === commit.hash);
    
    let track: number;
    let color: string;
    let hasIncoming = false;
    
    if (branchIdx !== -1) {
      const branch = activeBranches[branchIdx];
      track = branch.track;
      color = branch.color;
      hasIncoming = true;
      activeBranches.splice(branchIdx, 1);
    } else {
      const usedTracks = new Set(activeBranches.map(b => b.track));
      track = 0;
      while(usedTracks.has(track)) track++;
      color = COLORS[track % COLORS.length];
    }
    
    const parentConnections: { targetHash: string, track: number, color: string }[] = [];
    
    commit.parents.forEach((parentHash, pIdx) => {
      let existingBranchIdx = activeBranches.findIndex(b => b.hash === parentHash);
      if (existingBranchIdx !== -1) {
        parentConnections.push({ 
          targetHash: parentHash, 
          track: activeBranches[existingBranchIdx].track, 
          color: activeBranches[existingBranchIdx].color 
        });
      } else {
        let parentTrack: number;
        if (pIdx === 0) {
          parentTrack = track;
        } else {
          const usedTracks = new Set(activeBranches.map(b => b.track));
          parentTrack = 0;
          while(usedTracks.has(parentTrack)) parentTrack++;
        }
        const parentColor = (pIdx === 0) ? color : COLORS[parentTrack % COLORS.length];
        
        activeBranches.push({ hash: parentHash, track: parentTrack, color: parentColor });
        parentConnections.push({ targetHash: parentHash, track: parentTrack, color: parentColor });
      }
    });
    
    // passThrough is ONLY branches that existed in activeIn AND still exist in activeBranches (didn't terminate here)
    const passThrough = activeIn.filter(bIn => bIn.hash !== commit.hash).map(b => ({ track: b.track, color: b.color }));
    
    return { ...commit, track, color, hasIncoming, parentConnections, passThrough };
  });
};

export const SourceControl: React.FC<SourceControlProps> = ({ projectPath, onGitAction, gitStatusMap }) => {
  const [message, setMessage] = useState('');
  const [changes, setChanges] = useState<GitFile[]>([]);
  const [log, setLog] = useState<GraphCommitNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [commitFiles, setCommitFiles] = useState<GitFile[]>([]);
  const [loadingCommitFiles, setLoadingCommitFiles] = useState(false);

  const fetchStatus = async () => {
    if (!projectPath) return;
    try {
      const res = await (window as any).electron.gitStatus(projectPath);
      if (res && res.data) {
        const parsed = res.data.split('\n').filter((l: string) => l.trim()).map((line: string) => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3).trim()
        }));
        setChanges(parsed);
      } else {
        setChanges([]);
      }
    } catch(e) {
      setChanges([]);
    }
  };

  const fetchLog = async () => {
    if (!projectPath) return;
    try {
      const res = await (window as any).electron.gitLogStructured(projectPath);
      if (res && res.data) {
        const parsed = res.data.split('\n').filter((l: string) => l.trim()).map((line: string) => {
          const parts = line.split('|');
          const hash = parts[0] || '';
          const parentsStr = parts[1] || '';
          const subject = parts[2] || '';
          const authorName = parts[3] || '';
          const authorRelative = parts[4] || '';
          const refsRaw = parts[5] || '';
          
          const parents = parentsStr ? parentsStr.split(' ') : [];
          const refs = refsRaw ? refsRaw.replace(/[()]/g, '').trim().split(',').map(r => r.trim()).filter(Boolean) : [];
          return { hash, parents, subject, authorName, authorRelative, refs };
        });
        setLog(computeGraph(parsed));
      } else {
        setLog([]);
      }
    } catch (e) {
      setLog([]);
    }
  };

  const handleCommitClick = async (hash: string) => {
    if (expandedCommit === hash) {
      setExpandedCommit(null);
      return;
    }
    setExpandedCommit(hash);
    setLoadingCommitFiles(true);
    try {
      const res = await (window as any).electron.gitCommitFiles(projectPath, hash);
      if (res && res.data) {
        const parsed = res.data.split('\n')
          .filter((l: string) => l.trim())
          .map((line: string) => {
            const parts = line.split('\t');
            if (parts.length === 2) {
              return { status: parts[0].trim(), path: parts[1].trim() };
            }
            return { status: line.substring(0, 2).trim(), path: line.substring(2).trim() };
          });
        setCommitFiles(parsed);
      } else {
        setCommitFiles([]);
      }
    } catch (e) {
      setCommitFiles([]);
    }
    setLoadingCommitFiles(false);
  };

  const refresh = async () => {
    setLoading(true);
    await fetchStatus();
    await fetchLog();
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [projectPath, gitStatusMap]);

  const handleStageAll = async () => {
    if (!projectPath) return;
    await (window as any).electron.gitAdd(projectPath, '.');
    await refresh();
    if (onGitAction) onGitAction();
  };

  const handleCommit = async () => {
    if (!projectPath || !message.trim()) return;
    await (window as any).electron.gitCommit(projectPath, message.trim());
    setMessage('');
    await refresh();
    if (onGitAction) onGitAction();
  };

  const handleDiscard = async (file: string) => {
    if (!projectPath) return;
    await (window as any).electron.gitDiscard(projectPath, file);
    await refresh();
    if (onGitAction) onGitAction();
  };

  if (!projectPath) {
    return <div className="px-4 py-2 text-[#8b8b93] italic">No project loaded</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden text-[#a8a8b1]">
      <div className="px-4 mb-3 flex items-center justify-between shrink-0">
        <span className="text-[11px] font-bold tracking-wider text-[#8b8b93] uppercase">
          Source Control
        </span>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="p-1 hover:bg-white/5 text-[#8b8b93] hover:text-white rounded transition-colors" title="Refresh">
            <RotateCcw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="px-3 shrink-0 flex flex-col gap-2 mb-4">
        <input 
          type="text" 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message (Enter to commit)"
          className="w-full bg-[#18181f] border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommit();
          }}
        />
        <div className="flex gap-2">
          <button 
            onClick={handleStageAll}
            className="flex-1 py-1 text-[11px] bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors font-medium flex justify-center items-center gap-1"
          >
            <Plus size={12} /> Stage All
          </button>
          <button 
            onClick={handleCommit}
            disabled={!message.trim()}
            className="flex-1 py-1 text-[11px] bg-[#1e4b8a] hover:bg-[#255ba6] disabled:opacity-50 disabled:cursor-not-allowed rounded text-white transition-colors font-medium flex justify-center items-center gap-1"
          >
            <Check size={12} /> Commit
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Changes - Top Pane */}
        <div className="flex-[2] flex flex-col min-h-0 mb-2">
          <div className="px-3 flex items-center justify-between group cursor-pointer mb-2 shrink-0">
            <div className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-wider">
              Changes
              <span className="bg-white/10 px-2 py-0.5 rounded-full font-normal">{changes.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {changes.map((file, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1 hover:bg-white/5 cursor-pointer text-xs group">
                <span className="truncate pr-2 flex-1 text-[#d4d4d8]" title={file.path}>
                  {file.path.split('/').pop() || file.path.split('\\').pop()}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDiscard(file.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-[#8b8b93] hover:text-white transition-all"
                    title="Discard Changes"
                  >
                    <Undo2 size={13} />
                  </button>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    file.status.includes('M') ? "text-[#e2c08d]" : 
                    file.status.includes('A') || file.status.includes('?') ? "text-[#73c991]" :
                    "text-[#f48771]"
                  )}>
                    {file.status.includes('?') ? 'U' : file.status.trim()[0]}
                  </span>
                </div>
              </div>
            ))}
            {changes.length === 0 && (
              <div className="px-4 text-xs text-[#5b5b63] italic">No changes</div>
            )}
          </div>
        </div>

        {/* Graph - Bottom Pane */}
        <div className="flex-[3] flex flex-col min-h-0 border-t border-white/5 pt-2">
          <div className="px-3 flex items-center justify-between mb-3 shrink-0">
            <div className="flex items-center gap-2 text-[11px] font-bold text-white">
              Graph
              <span className="text-[10px] font-normal text-[#8b8b93] bg-white/5 px-2 rounded-full">Auto</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#8b8b93]">
              <button title="Target" className="hover:text-white cursor-pointer transition-colors"><Target size={14} /></button>
              <button title="Pull" className="hover:text-white cursor-pointer transition-colors"><ArrowDownToLine size={14} /></button>
              <button title="Fetch" className="hover:text-white cursor-pointer transition-colors"><ArrowDown size={14} /></button>
              <button title="Push" className="hover:text-white cursor-pointer transition-colors"><ArrowUp size={14} /></button>
              <button title="Refresh" onClick={refresh} className="hover:text-white cursor-pointer transition-colors ml-1"><RotateCcw size={14} /></button>
              <button className="hover:text-white cursor-pointer transition-colors ml-1"><MoreHorizontal size={14} /></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 pb-6 relative">
            {log.length === 0 && (
              <div className="text-[11px] text-[#6b6b73] italic">No history found.</div>
            )}
            
            {log.map((commit, i) => {
              const isExpanded = expandedCommit === commit.hash;
              
              const maxTrack = Math.max(
                commit.track, 
                ...commit.passThrough.map(p => p.track), 
                ...commit.parentConnections.map(p => p.track)
              );
              const gutterWidth = (maxTrack + 1) * 14 + 10;
              
              return (
                <div key={commit.hash} className="flex relative">
                  
                  {/* Left gutter for the graph line */}
                  <div className="shrink-0 flex flex-col relative z-10" style={{ width: gutterWidth }}>
                    <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                      {commit.passThrough.map(p => (
                         <line key={`pass-${p.track}`} x1={p.track * 14 + 12} y1="0" x2={p.track * 14 + 12} y2="100%" stroke={p.color} strokeWidth="2" />
                      ))}
                      
                      {commit.hasIncoming && (
                        <line x1={commit.track * 14 + 12} y1="0" x2={commit.track * 14 + 12} y2="15" stroke={commit.color} strokeWidth="2" />
                      )}
                      
                      {commit.parentConnections.map((p, pIdx) => (
                         <line key={`parent-${pIdx}`} x1={commit.track * 14 + 12} y1="15" x2={p.track * 14 + 12} y2="100%" stroke={p.color} strokeWidth="2" />
                      ))}
                    </svg>
                    
                    <div 
                      className="absolute w-[10px] h-[10px] rounded-full group-hover:scale-125 transition-transform cursor-pointer border-2 border-[#18181f]" 
                      style={{ 
                        left: commit.track * 14 + 12 - 5, 
                        top: 15 - 5,
                        backgroundColor: commit.color,
                        pointerEvents: 'auto'
                      }}
                      onClick={() => handleCommitClick(commit.hash)}
                    />
                  </div>

                  {/* Right side for content */}
                  <div className="flex-1 min-w-0 pb-1">
                    <div 
                      onClick={() => handleCommitClick(commit.hash)}
                      className="flex items-center h-[30px] group hover:bg-white/5 rounded-md pr-2 transition-colors cursor-pointer"
                    >
                    <div className="flex-1 min-w-0 flex items-center overflow-hidden pr-2 gap-2">
                      <span className="text-[11px] font-medium text-[#e2e2e3] truncate shrink min-w-[30px]" title={commit.subject}>
                        {commit.subject || 'Empty commit message'}
                      </span>
                      <span className="text-[10px] text-[#8b8b93] truncate shrink min-w-[30px]" title={commit.authorName}>
                        {commit.authorName}
                      </span>
                      
                      {commit.refs.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                          {commit.refs.map(ref => {
                            const isRemote = ref.includes('origin/');
                            const displayName = isRemote ? '☁' : '◎';
                            return (
                              <span 
                                key={ref} 
                                title={ref.replace('HEAD -> ', '')}
                                className={cn(
                                  "text-[10px] w-4 h-4 flex items-center justify-center rounded font-bold border",
                                  isRemote 
                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                    : "bg-[#3a71c1]/20 text-[#3a71c1] border-[#3a71c1]/30"
                                )}
                              >
                                {displayName}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="relative z-10 text-xs mt-1 mb-2">
                        {loadingCommitFiles ? (
                          <div className="text-[10px] text-[#5b5b63] italic py-1 pl-[10px]">Loading changes...</div>
                        ) : commitFiles.length === 0 ? (
                          <div className="text-[10px] text-[#5b5b63] italic py-1 pl-[10px]">No files changed.</div>
                        ) : (
                          <div className="space-y-[1px] relative">
                            {commitFiles.map((file, idx) => {
                              return (
                                <div key={idx} className="flex items-center relative h-6 group/file pr-2 hover:bg-white/5 rounded-md transition-colors cursor-pointer">
                                  {/* Horizontal branch line connecting to the main trunk */}
                                  <div 
                                    className="absolute"
                                    style={{ 
                                      left: `-${gutterWidth - (commit.track * 14 + 12)}px`, 
                                      top: '50%',
                                      width: `${(gutterWidth - (commit.track * 14 + 12)) + 10}px`,
                                      height: '2px',
                                      backgroundColor: commit.color,
                                      opacity: 0.3
                                    }}
                                  />
                                  <div className="flex-1 flex items-center justify-between ml-[10px] pr-2">
                                  <span className="truncate pr-2 flex-1 text-[#e2e2e3]" title={file.path}>
                                    {file.path.split('/').pop() || file.path.split('\\').pop()}
                                  </span>
                                  <span className="text-[#8b8b93] text-[9px] truncate max-w-[100px] hidden sm:block mr-2" title={file.path}>
                                    {file.path.substring(0, Math.max(0, file.path.lastIndexOf('/')))}
                                  </span>
                                  <span className={cn(
                                    "text-[10px] font-bold px-1 py-0.5 rounded shrink-0",
                                    file.status.includes('M') ? "text-[#e2c08d]" : 
                                    file.status.includes('A') || file.status.includes('?') ? "text-[#73c991]" :
                                    "text-[#f48771]"
                                  )}>
                                    {file.status.includes('?') ? 'U' : file.status.trim()[0]}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

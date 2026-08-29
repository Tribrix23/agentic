import React, { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, X, XCircle } from 'lucide-react';
import type { EnvironmentOperation } from '../../lib/environment/types';

import { Tooltip } from "../ui/Tooltip";

export const EnvironmentTaskStatusBar: React.FC = () => {
  const [operations, setOperations] = useState<EnvironmentOperation[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void window.electron.environment.listOperations().then(setOperations);
    return window.electron.environment.onProgress(operation => {
      setOperations(current => [operation, ...current.filter(item => item.id !== operation.id)]);
    });
  }, []);

  const active = operations.find(item => item.status === 'running' || item.status === 'queued');
  return (
    <div className="relative h-7 shrink-0 border-t border-white/5 bg-[#08080c] text-[10px] text-[#8b8b93] z-30">
      <button onClick={() => setExpanded(value => !value)} className="w-full h-full px-3 flex items-center gap-2 hover:bg-white/[0.03] text-left">
        {active ? <LoaderCircle size={12} className="animate-spin text-blue-400" /> : <CheckCircle2 size={12} className="text-emerald-500" />}
        <span className="truncate">{active ? `${active.provider} ${active.version}: ${active.progress.message}` : 'Environments ready'}</span>
        {active?.progress.percentage !== undefined && <span className="ml-auto tabular-nums">{active.progress.percentage}%</span>}
      </button>
      {active?.progress.percentage !== undefined && <div className="absolute left-0 bottom-0 h-0.5 bg-blue-500 transition-[width]" style={{ width: `${active.progress.percentage}%` }} />}
      {expanded && (
        <div className="absolute bottom-full right-2 mb-1 w-[min(420px,calc(100vw-80px))] max-h-64 overflow-y-auto bg-[#0f0f13] border border-white/10 rounded shadow-2xl p-2">
          <div className="px-1 py-1 text-[11px] font-semibold text-white">Environment operations</div>
          {operations.length === 0 && <div className="p-2">No environment operations yet.</div>}
          {operations.map(operation => (
            <div key={operation.id} className="p-2 border-t border-white/5 flex items-start gap-2">
              {operation.status === 'failed' ? <XCircle size={13} className="text-red-400 mt-0.5" /> : operation.status === 'cancelled' ? <XCircle size={13} className="text-[#a8a8b1] mt-0.5" /> : operation.status === 'completed' ? <CheckCircle2 size={13} className="text-emerald-400 mt-0.5" /> : <LoaderCircle size={13} className="text-blue-400 animate-spin mt-0.5" />}
              <div className="min-w-0 flex-1"><div className="text-white">{operation.provider} {operation.version} · {operation.phase}</div><div className="mt-0.5 break-words">{operation.progress.message}</div></div>
              {(operation.status === 'queued' || operation.status === 'running') && <Tooltip content="Cancel operation"><button
                  aria-label="Cancel operation"
                  onClick={() => void window.electron.environment.cancelOperation(operation.id)}
                  className="p-1 hover:text-white"><X size={12} /></button></Tooltip>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

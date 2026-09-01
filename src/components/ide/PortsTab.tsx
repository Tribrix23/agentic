import React, { useState, useRef, useEffect } from 'react';
import { X, Globe } from 'lucide-react';
import { cn } from '../../App';

export interface PortForward {
  id: string;
  port: number;
  forwardedAddress: string;
  process: string;
  origin: string;
}

export const PortsTab = () => {
  const [ports, setPorts] = useState<PortForward[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newPortInput, setNewPortInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAddSubmit = async (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') {
      if (e.key === 'Escape') {
        setIsAdding(false);
        setNewPortInput('');
      }
      return;
    }
    if (!newPortInput.trim()) {
      setIsAdding(false);
      return;
    }
    
    // Parse port
    const portVal = parseInt(newPortInput.trim().split(':').pop() || '0');
    if (portVal && !ports.find(p => p.port === portVal)) {
      setNewPortInput('');
      setIsAdding(false);
      
      const id = Math.random().toString();
      setPorts(prev => [...prev, {
        id,
        port: portVal,
        forwardedAddress: `Starting tunnel on ${portVal}...`,
        process: '-',
        origin: 'localtunnel'
      }]);
      
      try {
        const result = await window.electron.startPortForward(portVal);
        if (result.success) {
          setPorts(prev => prev.map(p => p.id === id ? {
            ...p,
            forwardedAddress: result.url.replace(/^https?:\/\//, ''),
            process: `Localtunnel (port ${portVal})`
          } : p));
        } else {
          setPorts(prev => prev.map(p => p.id === id ? {
            ...p,
            forwardedAddress: 'Error: ' + result.error
          } : p));
        }
      } catch (err) {
        setPorts(prev => prev.map(p => p.id === id ? {
          ...p,
          forwardedAddress: 'Failed to start tunnel'
        } : p));
      }
    } else {
      setNewPortInput('');
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#08080c] text-[13px] font-sans">
      <div className="flex w-full border-b border-white/5 bg-[#18181f] text-[#cccccc] text-xs font-semibold">
        <div className="flex-1 px-3 py-1.5 border-r border-white/5">Port</div>
        <div className="flex-1 px-3 py-1.5 border-r border-white/5">Forwarded Address</div>
        <div className="flex-[2] px-3 py-1.5 border-r border-white/5">Running Process</div>
        <div className="flex-1 px-3 py-1.5">Origin</div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col w-full">
          {isAdding && (
            <div className="flex w-full items-center border-b border-white/5">
              <div className="flex-1 px-2 py-1.5 border-r border-white/5 flex items-center">
                <input
                  ref={inputRef}
                  value={newPortInput}
                  onChange={(e) => setNewPortInput(e.target.value)}
                  onKeyDown={handleAddSubmit}
                  onBlur={() => handleAddSubmit()}
                  placeholder="Port number or address (eg. 3000...)"
                  className="w-full bg-[#3c3c3c] text-white px-2 py-0.5 rounded outline-none focus:ring-1 focus:ring-[#007acc] border border-[#3c3c3c] focus:border-transparent text-xs placeholder:text-gray-400"
                />
              </div>
              <div className="flex-1 px-3 py-1.5 border-r border-white/5"></div>
              <div className="flex-[2] px-3 py-1.5 border-r border-white/5"></div>
              <div className="flex-1 px-3 py-1.5"></div>
            </div>
          )}
          
          {ports.map((p) => (
            <div key={p.id} className="flex w-full items-center hover:bg-white/5 group border-b border-white/5 text-xs">
              <div className="flex-1 px-3 py-1.5 border-r border-white/5 font-mono text-[#d4d4d4] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe size={12} className="text-[#a8a8b1]" />
                  <span>{p.port}</span>
                </div>
                <button 
                  onMouseDown={(e) => { e.preventDefault(); window.electron?.stopPortForward?.(p.port); setPorts(prev => prev.filter(x => x.id !== p.id)); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded"
                  title="Stop Forwarding"
                >
                  <X size={12} className="text-[#a8a8b1]" />
                </button>
              </div>
              <div className="flex-1 px-3 py-1.5 border-r border-white/5 text-blue-400 hover:underline cursor-pointer flex items-center justify-between relative group/address">
                <span onClick={() => {
                  if (window.electron?.openExternal) {
                    window.electron.openExternal(`https://${p.forwardedAddress}`);
                  }
                }}>{p.forwardedAddress}</span>
              </div>
              <div className="flex-[2] px-3 py-1.5 border-r border-white/5 text-[#a8a8b1] truncate">{p.process}</div>
              <div className="flex-1 px-3 py-1.5 text-[#a8a8b1]">{p.origin}</div>
            </div>
          ))}

          {ports.length === 0 && !isAdding && (
            <div className="p-4 flex flex-col items-start gap-4">
              <p className="text-[#a8a8b1] font-sans">No forwarded ports. Forward a port to access your locally running services over the internet.</p>
              <button 
                onClick={() => setIsAdding(true)}
                className="px-4 py-1.5 bg-[#007acc] hover:bg-[#0088dd] text-white rounded font-sans transition-colors"
              >
                Forward a Port
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Plus, Trash2, ChevronDown, TerminalSquare } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalWidgetProps {
  cwd?: string;
}

const SingleTerminal = ({ id, cwd, isActive, onTitle }: { id: string, cwd?: string, isActive: boolean, onTitle: (id: string, title: string) => void }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 12,
      theme: {
        background: '#08080c',
        foreground: '#a8a8b1',
        cursor: '#5b5b63',
        black: '#0f0f13',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#2dd4bf',
        white: '#ffffff',
      },
      cursorBlink: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to node-pty
    window.electron.startTerminal(cwd || '', id);

    const removeTerminalDataListener = window.electron.onTerminalData((incomingId: string, data: string) => {
      if (incomingId === id) {
        term.write(data);
      }
    });

    term.onData((data) => {
      window.electron.sendTerminalData(data, id);
    });

    term.onTitleChange((title) => {
      onTitle(id, title || 'terminal');
    });

    term.onResize((size) => {
      window.electron.resizeTerminal(size.cols, size.rows, id);
    });

    const resizeObserver = new ResizeObserver(() => {
      // only fit if visible
      if (terminalRef.current && terminalRef.current.offsetParent !== null) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      removeTerminalDataListener();
      window.electron.killTerminal(id);
      term.dispose();
    };
  }, [cwd, id]);

  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current && terminalRef.current.offsetParent !== null) {
      setTimeout(() => fitAddonRef.current?.fit(), 10);
    }
  }, [isActive]);

  return (
    <div 
      ref={terminalRef} 
      className="w-full h-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
};

export const TerminalWidget: React.FC<TerminalWidgetProps & {
  terms: { id: string, name: string }[];
  activeTermId: string; // we'll pass activeGroupId terms here, and activeTermId to know which is focused, though we might not need it for single rendering
  onTitle: (id: string, title: string) => void;
}> = ({ cwd, terms, activeTermId, onTitle }) => {
  return (
    <div className="w-full h-full flex flex-row divide-x divide-white/10 relative overflow-hidden">
      {terms.map(t => (
        <div key={t.id} className="flex-1 h-full min-w-0 relative">
          <SingleTerminal 
            id={t.id} 
            cwd={cwd} 
            isActive={true} // all are visible side-by-side
            onTitle={onTitle}
          />
        </div>
      ))}
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface TerminalWidgetProps {
  cwd?: string;
}

export const TerminalWidget: React.FC<TerminalWidgetProps> = ({ cwd }) => {
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
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to node-pty
    (window as any).electron.startTerminal(cwd);

    const onData = (data: string) => {
      term.write(data);
    };

    (window as any).electron.onTerminalData(onData);

    term.onData((data) => {
      (window as any).electron.sendTerminalData(data);
    });

    term.onResize((size) => {
      (window as any).electron.resizeTerminal(size.cols, size.rows);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      (window as any).electron.killTerminal();
      term.dispose();
    };
  }, [cwd]);

  return (
    <div className="w-full h-full p-2 overflow-hidden bg-[#08080c]">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
};

import React from 'react';
import { Minus, Square, X } from 'lucide-react';

export const TitleBar = () => {
  const handleMinimize = () => {
    (window as any).electron?.windowControls?.minimize();
  };

  const handleMaximize = () => {
    (window as any).electron?.windowControls?.maximize();
  };

  const handleClose = () => {
    (window as any).electron?.windowControls?.close();
  };

  return (
    <div className="shrink-0 w-full h-8 flex justify-between items-center z-[100] region-drag bg-transparent absolute top-0 left-0 right-0 pointer-events-none">
      <div className="flex items-center h-full pl-4 pointer-events-auto region-no-drag gap-2 select-none">
        <img src="/icon.png" alt="QUANTIX Logo" className="w-[18px] h-[18px] object-contain" />
        <span className="shimmer-text font-bold text-[13px] tracking-wider">QUANTIX</span>
      </div>
      <div className="flex h-full region-no-drag pointer-events-auto bg-[#08080c]">
        <button 
          className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-white/10 hover:text-white transition-colors duration-100" 
          onClick={handleMinimize}
        >
          <Minus size={14} />
        </button>
        <button 
          className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-white/10 hover:text-white transition-colors duration-100" 
          onClick={handleMaximize}
        >
          <Square size={12} />
        </button>
        <button 
          className="w-[46px] h-full flex justify-center items-center text-[#8b8b93] hover:bg-red-500 hover:text-white transition-colors duration-100" 
          onClick={handleClose}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

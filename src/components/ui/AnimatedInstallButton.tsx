import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export interface AnimatedInstallButtonProps {
  onClick?: (e: React.MouseEvent) => void;
  iconSrc?: string; // no longer needed for this style but keeping for compatibility
  className?: string;
  children?: React.ReactNode;
  isProcessing?: boolean;
  isInstalled?: boolean;
}

export const AnimatedInstallButton: React.FC<AnimatedInstallButtonProps> = ({
  onClick,
  className,
  children,
  isProcessing,
  isInstalled
}) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      const dotSequence = ['...', '..', '.', '..', '...'];
      let index = 0;
      setDots(dotSequence[index]);
      interval = setInterval(() => {
        index = (index + 1) % dotSequence.length;
        setDots(dotSequence[index]);
      }, 400);
    } else {
      setDots('');
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  return (
    <button 
      onClick={onClick}
      disabled={isProcessing}
      className={cn(
        "relative flex items-center justify-center font-medium transition-colors outline-none",
        isProcessing ? "opacity-70 cursor-not-allowed" : "",
        isInstalled && !isProcessing ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" : "", // Optional distinct style for uninstall
        className
      )}
    >
      <AnimatePresence mode="wait">
        {isProcessing ? (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-1 min-w-[80px] justify-center"
          >
            {isInstalled ? "Uninstalling" : "Installing"}<span className="w-4 text-left inline-block">{dots}</span>
          </motion.div>
        ) : isInstalled ? (
          <motion.div
            key="installed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-2"
          >
            Uninstall
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-2"
          >
            {children || "Install"}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
};

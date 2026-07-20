import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  shortcut?: string;
  onClick: () => void;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    const handleContextMenuOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('contextmenu', handleContextMenuOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', handleContextMenuOutside);
    };
  }, [onClose]);

  // Adjust Y to prevent going off-screen (approx 30px per item)
  const adjustedX = Math.min(x, window.innerWidth - 260);
  const adjustedY = Math.min(y, window.innerHeight - (items.length * 26 + 10));

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        duration: 0.1,
        staggerChildren: 0.02
      }
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -5 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <motion.div
      ref={menuRef}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={containerVariants}
      className="fixed z-[9999] w-64 bg-[#1e1e1e] border border-[#454545] shadow-xl py-1 text-[#cccccc] text-[13px] rounded-md"
      style={{ top: adjustedY, left: adjustedX }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item, index) => (
        item.divider ? (
          <div key={`div-${index}`} className="my-1 border-t border-[#454545]" />
        ) : (
          <button
            key={item.label}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
            className="w-full flex items-center justify-between px-6 py-1 hover:bg-[#04395e] hover:text-white transition-colors text-left"
          >
            <motion.span variants={itemVariants}>{item.label}</motion.span>
            {item.shortcut && (
              <motion.span variants={itemVariants} className="text-[#8b8b93] text-[11px] ml-4">
                {item.shortcut}
              </motion.span>
            )}
          </button>
        )
      ))}
    </motion.div>
  );
};

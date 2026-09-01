import React, { ReactElement, useState, useRef, useEffect, cloneElement, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content: React.ReactNode;
  children: ReactElement;
  position?: TooltipPosition;
  align?: TooltipAlign;
}

export function Tooltip({ content, children, position = 'top', align = 'center' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      if (position === 'top') {
        top = rect.top - 8;
        if (align === 'center') left = rect.left + rect.width / 2;
        else if (align === 'start') left = rect.left;
        else if (align === 'end') left = rect.right;
      } else if (position === 'bottom') {
        top = rect.bottom + 8;
        if (align === 'center') left = rect.left + rect.width / 2;
        else if (align === 'start') left = rect.left;
        else if (align === 'end') left = rect.right;
      } else if (position === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
      } else if (position === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
      }

      setCoords({ top, left });
    }
  }, [isVisible, position, align]);

  const getTransform = () => {
    if (position === 'top') {
      if (align === 'center') return 'translate(-50%, -100%)';
      if (align === 'start') return 'translate(0, -100%)';
      if (align === 'end') return 'translate(-100%, -100%)';
    }
    if (position === 'bottom') {
      if (align === 'center') return 'translate(-50%, 0)';
      if (align === 'start') return 'translate(0, 0)';
      if (align === 'end') return 'translate(-100%, 0)';
    }
    if (position === 'left') return 'translate(-100%, -50%)';
    if (position === 'right') return 'translate(0, -50%)';
    return '';
  };

  const getArrowClasses = () => {
    let classes = "";
    if (position === 'top') classes = "border-t-0 border-b border-l-0 border-r transform rotate-45 absolute -bottom-1 ";
    else if (position === 'bottom') classes = "border-b-0 border-t border-r-0 border-l transform rotate-45 absolute -top-1 ";
    else if (position === 'left') classes = "border-b-0 border-t border-l-0 border-r transform rotate-45 absolute -right-1 top-1/2 -translate-y-1/2";
    else if (position === 'right') classes = "border-t-0 border-b border-r-0 border-l transform rotate-45 absolute -left-1 top-1/2 -translate-y-1/2";
    
    if (position === 'top' || position === 'bottom') {
      if (align === 'center') classes += "left-1/2 -translate-x-1/2";
      if (align === 'start') classes += "left-3";
      if (align === 'end') classes += "right-3";
    }
    return classes;
  };

  // Ensure we can attach a ref to the child
  const child = React.Children.only(children) as any;
  
  const handleMouseEnter = (e: any) => {
    setIsVisible(true);
    if (child.props.onMouseEnter) child.props.onMouseEnter(e);
  };
  
  const handleMouseLeave = (e: any) => {
    setIsVisible(false);
    if (child.props.onMouseLeave) child.props.onMouseLeave(e);
  };

  const trigger = cloneElement(child, {
    ref: (node: any) => {
      // Keep the original ref if it exists
      if (child.ref) {
        if (typeof child.ref === 'function') {
          child.ref(node);
        } else {
          child.ref.current = node;
        }
      }
      triggerRef.current = node;
    },
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    title: undefined, // Remove native tooltip
  });

  return (
    <>
      {trigger}
      {isVisible && createPortal(
          <div 
            className="fixed z-[99999] pointer-events-none whitespace-nowrap"
            style={{ top: coords.top, left: coords.left, transform: getTransform() }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="bg-[#2d2d30] text-gray-300 text-[11px] px-2.5 py-1.5 rounded shadow-xl border border-[#3e3e42] flex flex-col items-center gap-0.5 relative"
            >
              <span className="font-medium text-white">{content}</span>
              <div className={`w-2 h-2 bg-[#2d2d30] border-[#3e3e42] ${getArrowClasses()}`}></div>
            </motion.div>
          </div>,
        document.body
      )}
    </>
  );
}

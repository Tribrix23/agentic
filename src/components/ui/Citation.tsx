import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe, GraduationCap } from 'lucide-react';

interface CitationProps {
  href: string;
  title?: string;
  text: string;
}

export function Citation({ href, title, text }: CitationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (isVisible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2,
      });
    }
  }, [isVisible]);

  let domain = '';
  try {
    domain = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    domain = href;
  }

  const isAcademic = domain.includes('.edu') || domain.includes('.fi') || domain.includes('arxiv') || title?.includes('[PDF]');
  const Icon = isAcademic ? GraduationCap : Globe;

  return (
    <>
      <a
        ref={triggerRef}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-white/5 border border-white/10 text-[11px] font-medium text-[#a8a8b1] hover:bg-white/10 hover:text-white transition-colors cursor-pointer no-underline relative top-[-1px] mx-0.5"
      >
        <Icon size={10} className={isAcademic ? "text-blue-400" : "text-gray-400"} />
        {text}
      </a>

      <AnimatePresence>
        {isVisible && createPortal(
          <div 
            className="fixed z-[99999] pointer-events-none"
            style={{ 
              top: coords.top, 
              left: coords.left, 
              transform: 'translateX(-50%)' 
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="w-[320px] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden dark:bg-[#1e1e1e] dark:border-white/10"
            >
              <div className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-blue-500 dark:text-[#3a71c1]">
                  <Icon size={14} />
                  <span>{domain}</span>
                </div>
                
                <div className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 leading-tight line-clamp-2">
                  {title || href}
                </div>

                <div className="text-[12px] text-gray-500 dark:text-[#8b8b93] mt-1 line-clamp-3 leading-relaxed">
                  {title?.includes(' - ') ? title.split(' - ').slice(1).join(' - ') : "Referenced source for this information."}
                </div>
              </div>

              {isAcademic && (
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 dark:bg-white/[0.02] dark:border-white/5 flex items-center gap-2">
                  <GraduationCap size={14} className="text-gray-500 dark:text-[#8b8b93]" />
                  <span className="text-[11px] font-medium text-gray-500 dark:text-[#8b8b93]">{domain} is an academic source</span>
                </div>
              )}
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
}


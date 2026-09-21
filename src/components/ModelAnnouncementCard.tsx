import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { Tooltip } from "./ui/Tooltip";

const ANNOUNCEMENT_KEY = 'quantix_qwen_3_8_announcement_dismissed';

export const ModelAnnouncementCard = () => {
  const [isVisible, setIsVisible] = React.useState(
    () => sessionStorage.getItem(ANNOUNCEMENT_KEY) !== 'true'
  );

  const dismiss = () => {
    sessionStorage.setItem(ANNOUNCEMENT_KEY, 'true');
    setIsVisible(false);
  };

  const handleTryNow = () => {
    dismiss();
    window.dispatchEvent(new CustomEvent('open-model-picker'));
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          aria-label="New model announcement"
          className="fixed bottom-12 left-4 z-40 w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-xl shadow-2xl bg-[#18181b] border border-white/[0.08]"
          initial={{ opacity: 0, y: 90, scale: 0.97, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 38, scale: 0.98, filter: 'blur(5px)' }}
          transition={{ duration: 0.72, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Top half: Image */}
          <div className="relative border-b border-white/[0.05] bg-[#050505]">
            <div className="absolute top-3 right-3 z-30">
              <Tooltip content="Close">
                <button
                  aria-label="Close model announcement"
                  className="region-no-drag grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/70 bg-black/40 backdrop-blur-md transition-all hover:bg-black/70 hover:text-white focus:outline-none"
                  onClick={dismiss}
                  type="button">
                  <X size={15} />
                </button>
              </Tooltip>
            </div>
            
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -left-1/2 top-0 z-20 h-full w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"
              animate={{ left: ['-50%', '130%'] }}
              transition={{ duration: 2.2, delay: 1.1, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
            />

            <img 
              src="./Pic.png" 
              alt="Announcement" 
              className="w-full h-[190px] block object-cover object-center" 
            />
          </div>

          {/* Bottom half: Text content */}
          <div className="p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-bold leading-tight text-white">
                GPT-6 Astra is now on Quantix
              </h3>
              <span className="shrink-0 rounded bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-blue-400">
                New model
              </span>
            </div>

            <p className="text-[13px] leading-relaxed text-gray-400">
              GPT-6's newest Astra model is live in the catalog. It features a massive native context window for complex reasoning and everyday work, ready to handle your largest codebases.
            </p>

            <div className="mt-2 flex items-center gap-5">
              <button 
                onClick={handleTryNow}
                className="rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2 text-[13px] font-bold text-white shadow-sm">
                Try it now
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
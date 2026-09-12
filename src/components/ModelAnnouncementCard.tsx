import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { OpenAIIcon } from './icons/OpenAIIcon';

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

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          aria-label="New model announcement"
          className="fixed bottom-12 left-4 z-40 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-lg border-2 border-pink-500 bg-[#2d1b38]/95 backdrop-blur-xl"
          initial={{ opacity: 0, y: 90, scale: 0.97, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 38, scale: 0.98, filter: 'blur(5px)' }}
          transition={{ duration: 0.72, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(236,72,153,0.35),transparent_50%)]" />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/[0.2] to-transparent"
            animate={{ left: ['-50%', '130%'] }}
            transition={{ duration: 2.2, delay: 1.1, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
          />

          <div className="relative p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-pink-300">
                <span>New Model Supported</span>
              </div>
              <Tooltip content="Close"><button
                  aria-label="Close model announcement"
                  className="region-no-drag -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/60 transition-colors hover:bg-white/[0.15] hover:text-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                  onClick={dismiss}
                  type="button">
                  <X size={15} />
                </button></Tooltip>
            </div>

            <div className="mb-1 flex items-center gap-3 text-white">
              <OpenAIIcon className="h-8 w-8 text-white" />
              <div className="text-3xl font-extrabold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                GPT-6 Astra
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 border-b border-white/[0.15] pb-5 mt-2">
              <div>
                <h2 className="text-[18px] font-semibold text-white">Next-Gen Intelligence</h2>
                <p className="mt-1 text-[11.5px] font-medium text-pink-200">Now available in Quantix Code</p>
              </div>
              <span className="mb-0.5 shrink-0 rounded border border-pink-400/50 bg-pink-500/20 px-2.5 py-1 text-[10px] font-bold uppercase text-white">
                LATEST
              </span>
            </div>

            <p className="mt-4 text-[13px] leading-relaxed text-white/90">
              Experience unprecedented intelligence with a native 2M context window and autonomous sub-agent orchestration.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.08]">
              {[
                ['Reasoning', 'Advanced'],
                ['Context', '2M Native'],
                ['Tools', 'Orchestration'],
              ].map(([label, value]) => (
                <div className="bg-[#15161a] px-3 py-2.5" key={label}>
                  <div className="text-[9px] uppercase text-white/35">{label}</div>
                  <div className="mt-1 text-[11px] font-medium text-white/80">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
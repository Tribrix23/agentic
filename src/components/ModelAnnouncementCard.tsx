import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { QwenIcon } from './icons/QwenIcon';
import { QwenWordmark } from './icons/QwenWordmark';

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
          className="fixed bottom-12 left-4 z-40 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-lg border border-[#623ae7]/20 bg-[#161224]/95 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_50px_rgba(98,58,231,0.2)] backdrop-blur-xl"
          initial={{ opacity: 0, y: 90, scale: 0.97, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 38, scale: 0.98, filter: 'blur(5px)' }}
          transition={{ duration: 0.72, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(139,92,246,0.25),transparent_40%)]" />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -left-1/2 top-0 h-full w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
            animate={{ left: ['-50%', '130%'] }}
            transition={{ duration: 2.2, delay: 1.1, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
          />

          <div className="relative p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase text-white">
                <span>New model supported</span>
              </div>
              <Tooltip content="Close"><button
                  aria-label="Close model announcement"
                  className="region-no-drag -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-1 focus:ring-[#a78bfa]/70"
                  onClick={dismiss}
                  type="button">
                  <X size={15} />
                </button></Tooltip>
            </div>

            <div className="mb-1 flex items-center gap-3 text-white">
              <QwenIcon className="h-10 w-10 shrink-0 text-[#623ae7]" />
              <div className="w-[120px] max-w-full">
                <QwenWordmark />
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
              <div>
                <h2 className="text-[20px] font-semibold text-white">Qwen3.8</h2>
                <p className="mt-1 text-[11px] text-white/45">Now available in Quantix Code</p>
              </div>
              <span className="mb-0.5 shrink-0 rounded border border-[#a78bfa]/25 bg-[#a78bfa]/[0.1] px-2 py-1 text-[9px] font-semibold uppercase text-white">
                Latest
              </span>
            </div>

            <p className="mt-4 text-[12px] leading-5 text-[#a8a9b1]">
              Built for deeper reasoning, precise code changes, and longer autonomous workflows with faster responses.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.08]">
              {[
                ['Reasoning', 'Advanced'],
                ['Context', '256K'],
                ['Tools', 'Native'],
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
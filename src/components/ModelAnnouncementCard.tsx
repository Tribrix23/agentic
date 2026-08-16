import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { OpenAIIcon } from './icons/OpenAIIcon';

const ANNOUNCEMENT_KEY = 'quantix_gpt_5_6_sol_announcement_dismissed';

const GptWordmark = () => (
  <svg
    aria-label="GPT"
    className="h-auto w-full"
    role="img"
    viewBox="0 0 390 112"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="gpt-wordmark-fill" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.44" stopColor="#ffffff" />
        <stop offset="0.7" stopColor="#ffffff" />
        <stop offset="1" stopColor="#ffffff" />
      </linearGradient>
      <filter id="gpt-wordmark-glow" height="170%" width="130%" x="-15%" y="-35%">
        <feGaussianBlur result="blur" stdDeviation="5" />
        <feColorMatrix
          in="blur"
          result="glow"
          values="0 0 0 0 0.65 0 0 0 0 0.65 0 0 0 0 0.65 0 0 0 .3 0"
        />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <text
      fill="url(#gpt-wordmark-fill)"
      filter="url(#gpt-wordmark-glow)"
      fontFamily="Inter, Arial, sans-serif"
      fontSize="104"
      fontWeight="750"
      letterSpacing="0"
      x="0"
      y="92"
    >
      GPT
    </text>
  </svg>
);

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
          className="fixed bottom-12 left-4 z-40 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-lg border border-white/[0.12] bg-[#111216]/95 shadow-[0_24px_80px_rgba(0,0,0,0.65),0_0_42px_rgba(139,92,246,0.1)] backdrop-blur-xl"
          initial={{ opacity: 0, y: 90, scale: 0.97, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 38, scale: 0.98, filter: 'blur(5px)' }}
          transition={{ duration: 0.72, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(139,92,246,0.14),transparent_34%)]" />
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
              <button
                aria-label="Close model announcement"
                className="region-no-drag -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus:ring-1 focus:ring-[#a78bfa]/70"
                onClick={dismiss}
                title="Close"
                type="button"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mb-1 flex items-center gap-3 text-white">
              <OpenAIIcon className="h-10 w-10 shrink-0 text-[#c4b5fd]" />
              <div className="w-[205px] max-w-full">
                <GptWordmark />
              </div>
            </div>

            <div className="flex items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
              <div>
                <h2 className="text-[20px] font-semibold text-white">GPT-5.6 Sol</h2>
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
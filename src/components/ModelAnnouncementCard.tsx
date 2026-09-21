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
          className="fixed bottom-12 left-4 z-40 w-[min(390px,calc(100vw-32px))] overflow-hidden rounded-lg shadow-2xl bg-transparent"
          initial={{ opacity: 0, y: 90, scale: 0.97, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 38, scale: 0.98, filter: 'blur(5px)' }}
          transition={{ duration: 0.72, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >

          <div className="relative p-0">
            <div className="absolute top-2 right-2 z-30">
              <Tooltip content="Close">
                <button
                  aria-label="Close model announcement"
                  className="region-no-drag grid h-7 w-7 shrink-0 place-items-center rounded-md text-white bg-black/70 backdrop-blur-md shadow-lg border border-white/20 transition-all hover:bg-black/90 focus:outline-none"
                  onClick={dismiss}
                  type="button">
                  <X size={15} />
                </button>
              </Tooltip>
            </div>
            
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -left-1/2 top-0 z-20 h-full w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/[0.4] to-transparent"
              animate={{ left: ['-50%', '130%'] }}
              transition={{ duration: 2.2, delay: 1.1, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
            />

            <img src="./Pic.png" alt="Announcement" className="w-full h-auto block" />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
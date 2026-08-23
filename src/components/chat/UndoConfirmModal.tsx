import React from 'react';
import { X, RotateCcw, FileCode2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

export interface UndoFileChange {
  path: string;
  added?: number;
  removed?: number;
  type?: string;
}

interface UndoConfirmModalProps {
  isOpen: boolean;
  changes: UndoFileChange[];
  onConfirm: () => void;
  onCancel: () => void;
  hasCheckpoint?: boolean;
}

export function UndoConfirmModal({ isOpen, changes, onConfirm, onCancel, hasCheckpoint = false }: UndoConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[500] flex items-center justify-center p-8"
          onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-md bg-[#141419] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-white/5 text-white/60">
                  <RotateCcw size={15} />
                </div>
                <h2 className="text-[15px] font-semibold text-white">Confirm Undo</h2>
              </div>
              <button
                onClick={onCancel}
                className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-5 flex flex-col gap-4">
              <p className="text-sm text-white/50 leading-relaxed">
                {changes.length === 0 
                  ? hasCheckpoint ? "Confirming this undo action will remove this and all subsequent messages, then restore the complete project checkpoint." : "Confirming this undo action will remove this and all subsequent messages. No file changes will be reverted."
                  : "Confirming this undo action will remove this and all subsequent messages, and revert the following file changes:"}
              </p>

              {/* File list */}
              <div className="flex flex-col gap-1.5 bg-[#0f0f13] border border-white/5 rounded-lg p-3">
                {changes.length === 0 ? (
                  <p className="text-xs text-white/30 text-center py-2">{hasCheckpoint ? 'Complete Git checkpoint will be restored' : 'No file changes to undo'}</p>
                ) : (
                  changes.map((c, i) => {
                    const filename = c.path.split(/[/\\]/).pop() || c.path;
                    
                    // Only show an action label for cases that have no meaningful +N -N
                    let actionLabel = '';
                    let actionColor = '';
                    if (c.type === 'file_delete' || c.type === 'folder_delete') {
                      actionLabel = 'Restore';
                      actionColor = 'text-emerald-400';
                    } else if (c.type === 'file_create' || c.type === 'folder_create') {
                      actionLabel = 'Delete';
                      actionColor = 'text-red-400';
                    }

                    return (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <FileCode2 size={14} className="text-purple-400 shrink-0" />
                        <span className="text-sm text-white/80 font-medium truncate flex-1 min-w-0">
                          {filename}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-semibold">
                          {actionLabel ? (
                            <span className={actionLabel === 'Restore' ? 'text-emerald-400' : 'text-red-400/80'}>{actionLabel}</span>
                          ) : (
                            <>
                              {c.added !== undefined && c.added > 0 && (
                                <span className="text-emerald-400">+{c.added}</span>
                              )}
                              {c.removed !== undefined && c.removed > 0 && (
                                <span className="text-red-400">-{c.removed}</span>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onCancel}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                    "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                  )}
                >
                  <RotateCcw size={13} />
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

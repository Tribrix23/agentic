import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface QuotaExhaustedNoticeProps {
  message: string;
  onDismiss: () => void;
  onSelectModel: () => void;
  onUpgrade: () => void;
}

export function QuotaExhaustedNotice({
  message,
  onDismiss,
  onSelectModel,
  onUpgrade,
}: QuotaExhaustedNoticeProps) {
  return (
    <div className="w-full max-w-[750px] rounded-md border border-white/10 bg-[#111113] px-4 py-3 text-left shadow-lg" role="alert">
      <div className="flex items-start gap-2.5">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white">Model quota reached</p>
          <p className="mt-1 text-[12px] leading-5 text-[#a8a8b1]">{message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 text-[#73737b] transition-colors hover:text-white"
          title="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onSelectModel}
          className="rounded-md bg-white/10 px-3 py-1.5 text-[12px] font-medium text-[#d4d4d8] transition-colors hover:bg-white/15 hover:text-white"
        >
          Select another model
        </button>
        <button
          type="button"
          onClick={onUpgrade}
          className="rounded-md bg-[#007acc] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#0088dd]"
        >
          Upgrade
        </button>
      </div>
    </div>
  );
}
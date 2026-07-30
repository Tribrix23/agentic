import React, { useState, useEffect } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface AskUserCardProps {
  question: string;
  options?: string[];
  onSubmit: (response: string) => void;
}

export const AskUserCard: React.FC<AskUserCardProps> = ({ 
  question, 
  options,
  onSubmit
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customResponse, setCustomResponse] = useState('');

  // If there are valid options, default select the first one
  useEffect(() => {
    if (Array.isArray(options) && options.length > 0) {
      setSelectedOption(options[0]);
    } else {
      setSelectedOption(null);
    }
  }, [options]);

  const handleSubmit = () => {
    const validOptions = Array.isArray(options) ? options : [];
    if (validOptions.length > 0 && selectedOption !== 'custom') {
      if (selectedOption) onSubmit(selectedOption);
    } else if (customResponse.trim()) {
      onSubmit(customResponse.trim());
    }
  };

  const validOptions = Array.isArray(options) ? options : [];
  const hasOptions = validOptions.length > 0;

  return (
    <div className="w-full max-w-[750px] mx-auto bg-[#1c1c21] border border-[#007acc]/40 rounded-2xl shadow-[0_0_20px_rgba(0,122,204,0.1)] overflow-hidden animate-fade-in pointer-events-auto relative">
      {/* Decorative top border glow */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#007acc]/0 via-[#007acc] to-[#007acc]/0"></div>
      
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-2.5 bg-[#007acc]/10 text-[#007acc] rounded-xl shrink-0 mt-0.5">
            <MessageCircleQuestion size={20} className="animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold text-white leading-snug">
              Question from Agent
            </h3>
            <p className="text-[14px] text-[#e2e2e3] mt-2 whitespace-pre-wrap leading-relaxed">
              {question}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {hasOptions && validOptions.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedOption(opt)}
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-lg text-left text-[13px] transition-colors border",
                selectedOption === opt 
                  ? "bg-white/10 border-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                  : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
              )}
            >
              <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">
                {idx + 1}
              </div>
              <span className="flex-1">{opt}</span>
            </button>
          ))}

          {hasOptions && (
            <button
              onClick={() => setSelectedOption('custom')}
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-lg text-left text-[13px] transition-colors border",
                selectedOption === 'custom' 
                  ? "bg-white/10 border-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                  : "bg-transparent border-transparent text-[#a8a8b1] hover:bg-white/5 hover:text-[#e2e2e3]"
              )}
            >
              <div className="w-5 h-5 rounded flex items-center justify-center bg-white/10 text-[11px] text-[#a8a8b1] font-mono shrink-0">
                {options.length + 1}
              </div>
              <span className="flex-1">Other / Custom</span>
            </button>
          )}
        </div>

        {/* Free-form text input */}
        {(!hasOptions || selectedOption === 'custom') && (
          <div className="mt-4 animate-fade-in">
            <textarea
              value={customResponse}
              onChange={(e) => setCustomResponse(e.target.value)}
              placeholder="Type your response..."
              className="w-full bg-[#0f0f13] border border-white/10 rounded-xl p-3 text-[14px] text-white outline-none focus:border-[#007acc] transition-colors resize-none custom-scrollbar min-h-[80px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && customResponse.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            onClick={handleSubmit}
            disabled={(hasOptions && selectedOption === 'custom' && !customResponse.trim()) || (!hasOptions && !customResponse.trim())}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold bg-[#007acc] hover:bg-[#0088dd] text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            Submit Response
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

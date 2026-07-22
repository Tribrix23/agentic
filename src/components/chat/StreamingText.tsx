import React from 'react';

const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  speed?: number;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  return (
    <span>
      {text}
      {isStreaming && (
        <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle bg-current animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
      )}
    </span>
  );
}

import { CSSProperties, forwardRef, HTMLAttributes } from 'react';

export type KbdSize = 'sm' | 'md';

export interface KbdProps extends HTMLAttributes<HTMLSpanElement> {
  /** A combo string ("Ctrl+Shift+L") or an explicit token array. */
  keys: string | string[];
  size?: KbdSize;
}

interface SizeSpec {
  h: number;
  pad: string;
  font: number;
  gap: number;
}

const SIZES: Record<KbdSize, SizeSpec> = {
  sm: { h: 16, pad: '0 4px', font: 10, gap: 2 },
  md: { h: 20, pad: '0 6px', font: 11, gap: 3 },
};

export const Kbd = forwardRef<HTMLSpanElement, KbdProps>(function Kbd(
  { keys, size = 'md', style, ...rest },
  ref,
) {
  const tokens = Array.isArray(keys)
    ? keys
    : String(keys)
        .split('+')
        .map((k) => k.trim())
        .filter(Boolean);
  const s = SIZES[size];

  const keyStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: s.h,
    height: s.h,
    padding: s.pad,
    fontFamily: 'var(--font-mono)',
    fontSize: s.font,
    fontWeight: 'var(--weight-medium)',
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border-strong)',
    borderBottomWidth: 2,
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-1)',
    whiteSpace: 'nowrap',
  };

  return (
    <span
      ref={ref}
      style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, ...style }}
      {...rest}
    >
      {tokens.map((k, i) => (
        <kbd key={i} style={keyStyle}>
          {k}
        </kbd>
      ))}
    </span>
  );
});

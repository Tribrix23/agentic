import { CSSProperties, forwardRef, HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../../Icon';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface ToneSpec {
  fg: string;
  bg: string;
  bd: string;
}

const TONES: Record<BadgeTone, ToneSpec> = {
  neutral: {
    fg: 'var(--color-text-secondary)',
    bg: 'var(--color-surface-alt)',
    bd: 'var(--color-border-strong)',
  },
  accent: {
    fg: 'var(--color-accent)',
    bg: 'var(--color-accent-soft)',
    bd: 'var(--color-accent)',
  },
  success: {
    fg: 'var(--color-success)',
    bg: 'var(--color-success-soft)',
    bd: 'var(--color-success)',
  },
  warning: {
    fg: 'var(--color-warning)',
    bg: 'var(--color-warning-soft)',
    bd: 'var(--color-warning)',
  },
  danger: {
    fg: 'var(--color-danger)',
    bg: 'var(--color-danger-soft)',
    bd: 'var(--color-danger)',
  },
  info: {
    fg: 'var(--color-info)',
    bg: 'var(--color-info-soft)',
    bd: 'var(--color-info)',
  },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Filled capsule with white text instead of tinted fill. */
  solid?: boolean;
  /** Leading status dot. */
  dot?: boolean;
  /** Leading Material Symbols ligature name. */
  icon?: string;
  children?: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { children, tone = 'neutral', solid = false, dot = false, icon, style, ...rest },
  ref,
) {
  const t = TONES[tone];
  const borderHue = t.bd === 'var(--color-border-strong)' ? 'var(--color-border-strong)' : t.fg;
  const border = solid
    ? '1px solid transparent'
    : `1px solid color-mix(in srgb, ${borderHue} 35%, transparent)`;

  const merged: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 19,
    padding: '0 8px',
    borderRadius: 'var(--radius-pill)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    color: solid ? '#fff' : t.fg,
    background: solid ? t.bd : t.bg,
    border,
    ...style,
  };

  return (
    <span ref={ref} style={merged} {...rest}>
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: solid ? '#fff' : t.fg,
            flex: '0 0 auto',
          }}
        />
      )}
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
});

import {
  ButtonHTMLAttributes,
  CSSProperties,
  forwardRef,
  HTMLAttributes,
  ReactNode,
} from 'react';
import { Icon } from '../../Icon';

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning';

interface ToneSpec {
  fg: string;
  bg: string;
  bd: string;
}

const TONES: Record<PillTone, ToneSpec> = {
  neutral: {
    fg: 'var(--color-text-secondary)',
    bg: 'var(--color-toolbar-pill)',
    bd: 'var(--color-border)',
  },
  accent: {
    fg: 'var(--color-accent)',
    bg: 'var(--color-accent-soft)',
    bd: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
  },
  success: {
    fg: 'var(--color-success)',
    bg: 'var(--color-success-soft)',
    bd: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
  },
  warning: {
    fg: 'var(--color-warning)',
    bg: 'var(--color-warning-soft)',
    bd: 'color-mix(in srgb, var(--color-warning) 35%, transparent)',
  },
};

interface BasePillProps {
  tone?: PillTone;
  /** Render text in JetBrains Mono — used for cell addresses / version chips. */
  mono?: boolean;
  /** Leading Material Symbols ligature name. */
  icon?: string;
  children?: ReactNode;
}

type StaticPillProps = BasePillProps & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;
type ButtonPillProps = BasePillProps & {
  onClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export type PillProps = StaticPillProps | ButtonPillProps;

function pillStyle(t: ToneSpec, mono: boolean, clickable: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 22,
    padding: '0 9px',
    borderRadius: 'var(--radius-pill)',
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    color: t.fg,
    background: t.bg,
    border: `1px solid ${t.bd}`,
    cursor: clickable ? 'pointer' : 'default',
  };
}

export const Pill = forwardRef<HTMLElement, PillProps>(function Pill(props, ref) {
  const { tone = 'neutral', mono = false, icon, children, style, ...rest } = props as BasePillProps & {
    style?: CSSProperties;
  };
  const t = TONES[tone];
  const onClick = (props as { onClick?: unknown }).onClick;

  if (typeof onClick === 'function') {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        style={{ ...pillStyle(t, mono, true), ...style }}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {icon && <Icon name={icon} size={15} />}
        {children}
      </button>
    );
  }
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      style={{ ...pillStyle(t, mono, false), ...style }}
      {...(rest as HTMLAttributes<HTMLSpanElement>)}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </span>
  );
});

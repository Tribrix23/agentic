import {
  ButtonHTMLAttributes,
  CSSProperties,
  forwardRef,
  ReactNode,
  useState,
} from 'react';
import { Icon } from '../../Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading Material Symbols ligature name. */
  icon?: string;
  /** Trailing Material Symbols ligature name. */
  iconRight?: string;
  /** Stretch to fill its container. */
  full?: boolean;
  /** Defaults to `'button'`. */
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  children?: ReactNode;
}

interface SizeSpec {
  height: number;
  padding: string;
  font: string;
  gap: number;
  icon: number;
}

const SIZES: Record<ButtonSize, SizeSpec> = {
  sm: { height: 28, padding: '0 11px', font: 'var(--text-sm)', gap: 5, icon: 16 },
  md: { height: 34, padding: '0 15px', font: 'var(--text-md)', gap: 7, icon: 18 },
  lg: { height: 42, padding: '0 22px', font: 'var(--text-md)', gap: 8, icon: 20 },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--accent-gradient)',
    color: 'var(--color-accent-fg)',
    border: '1px solid transparent',
    boxShadow: '0 1px 2px rgba(16,24,40,0.18), inset 0 1px 0 rgba(255,255,255,0.18)',
  },
  secondary: {
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border-strong)',
    boxShadow: 'var(--shadow-1)',
  },
  subtle: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1px solid transparent',
    boxShadow: 'none',
  },
  danger: {
    background: 'var(--color-danger)',
    color: '#fff',
    border: '1px solid transparent',
    boxShadow: '0 1px 2px rgba(16,24,40,0.18), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    disabled = false,
    full = false,
    type = 'button',
    style,
    onMouseEnter,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];
  const v = VARIANTS[variant];
  const [hover, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const [focus, setFocus] = useState(false);

  const hoverStyle: CSSProperties | null =
    !disabled && hover
      ? variant === 'primary'
        ? {
            filter: 'brightness(1.06) saturate(1.05)',
            boxShadow:
              '0 4px 12px -2px color-mix(in srgb, var(--color-accent) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.22)',
          }
        : variant === 'danger'
          ? { filter: 'brightness(1.05)' }
          : { background: 'var(--color-hover)', borderColor: 'var(--color-text-secondary)' }
      : null;

  const ring: CSSProperties | null =
    focus && !disabled ? { boxShadow: 'var(--glow-accent)' } : null;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      onFocus={(e) => {
        setFocus(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        onBlur?.(e);
      }}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        setActive(false);
        onMouseLeave?.(e);
      }}
      onMouseDown={(e) => {
        setActive(true);
        onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setActive(false);
        onMouseUp?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        width: full ? '100%' : undefined,
        height: s.height,
        padding: s.padding,
        font: 'inherit',
        fontFamily: 'var(--font-sans)',
        fontSize: s.font,
        fontWeight: 'var(--weight-semibold)',
        letterSpacing: '-0.005em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transform:
          active && !disabled
            ? 'translateY(1px)'
            : hover && !disabled && variant !== 'subtle'
              ? 'translateY(-1px)'
              : 'none',
        transition:
          'transform var(--motion-base) var(--ease-spring), background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), filter var(--motion-fast) var(--ease-out), box-shadow var(--motion-base) var(--ease-out)',
        ...v,
        ...hoverStyle,
        ...ring,
        ...style,
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={s.icon} />}
      {children != null && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </button>
  );
});

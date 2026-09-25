import {
  ButtonHTMLAttributes,
  forwardRef,
  useState,
} from 'react';
import { Icon } from '../../Icon';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Material Symbols Outlined ligature name. */
  icon: string;
  /** Accessible label — surfaced as `aria-label` and `title`. */
  label: string;
  size?: IconButtonSize;
  /** When true the button paints as a toggled-on formatting control. */
  pressed?: boolean;
}

interface SizeSpec {
  box: number;
  icon: number;
}

const SIZES: Record<IconButtonSize, SizeSpec> = {
  sm: { box: 24, icon: 16 },
  md: { box: 28, icon: 18 },
  lg: { box: 36, icon: 20 },
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    size = 'md',
    pressed = false,
    disabled = false,
    style,
    onFocus,
    onBlur,
    onMouseEnter,
    onMouseLeave,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);

  const bg = pressed
    ? 'var(--color-selected)'
    : hover && !disabled
      ? 'var(--color-hover)'
      : 'transparent';

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
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
        onMouseLeave?.(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: s.box,
        height: s.box,
        padding: 0,
        border: '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        background: bg,
        color: pressed ? 'var(--color-accent)' : 'var(--color-text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: focus && !disabled ? 'var(--glow-accent)' : 'none',
        transition:
          'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out), box-shadow var(--motion-base) var(--ease-out)',
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={s.icon} />
    </button>
  );
});

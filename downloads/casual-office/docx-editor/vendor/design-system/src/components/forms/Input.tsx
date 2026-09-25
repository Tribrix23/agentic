import {
  CSSProperties,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  useState,
} from 'react';
import { Icon } from '../../Icon';

export type InputSize = 'sm' | 'md';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  /** Leading Material Symbols ligature name. */
  icon?: string;
  size?: InputSize;
  invalid?: boolean;
  full?: boolean;
}

interface SizeSpec {
  height: number;
  padding: string;
  font: string;
}

const SIZES: Record<InputSize, SizeSpec> = {
  sm: { height: 28, padding: '0 8px', font: 'var(--text-sm)' },
  md: { height: 34, padding: '0 10px', font: 'var(--text-md)' },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    value,
    defaultValue,
    placeholder,
    label,
    hint,
    icon,
    type = 'text',
    size = 'md',
    disabled = false,
    invalid = false,
    full = false,
    onChange,
    onFocus,
    onBlur,
    style,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];
  const [focus, setFocus] = useState(false);

  const borderColor = invalid
    ? 'var(--color-danger)'
    : focus
      ? 'var(--color-accent)'
      : 'var(--color-border-strong)';

  const field = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: s.height,
        padding: s.padding,
        background: disabled ? 'var(--color-surface-alt)' : 'var(--color-surface)',
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: focus
          ? `0 0 0 3px ${invalid ? 'var(--color-danger-soft)' : 'var(--color-accent-soft)'}`
          : 'none',
        transition:
          'border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
        width: full ? '100%' : undefined,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon && (
        <Icon name={icon} size="md" style={{ color: 'var(--color-text-secondary)' } as CSSProperties} />
      )}
      <input
        ref={ref}
        type={type}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          background: 'transparent',
          font: 'inherit',
          fontFamily: 'var(--font-sans)',
          fontSize: s.font,
          color: 'var(--color-text)',
        }}
        {...rest}
      />
    </div>
  );

  if (label == null && hint == null) {
    return <div style={{ width: full ? '100%' : undefined, ...style }}>{field}</div>;
  }

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        width: full ? '100%' : undefined,
        ...style,
      }}
    >
      {label != null && (
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--color-text)',
          }}
        >
          {label}
        </span>
      )}
      {field}
      {hint != null && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: invalid ? 'var(--color-danger)' : 'var(--color-text-secondary)',
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
});

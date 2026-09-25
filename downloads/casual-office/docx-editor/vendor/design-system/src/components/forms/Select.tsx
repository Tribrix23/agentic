import {
  CSSProperties,
  forwardRef,
  ReactNode,
  SelectHTMLAttributes,
  useState,
} from 'react';
import { Icon } from '../../Icon';

export type SelectSize = 'sm' | 'md';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options?: Array<SelectOption | string>;
  label?: ReactNode;
  size?: SelectSize;
  full?: boolean;
  width?: number | string;
  containerStyle?: CSSProperties;
}

interface SizeSpec {
  height: number;
  padding: string;
  font: string;
}

const SIZES: Record<SelectSize, SizeSpec> = {
  sm: { height: 26, padding: '0 26px 0 8px', font: 'var(--text-sm)' },
  md: { height: 32, padding: '0 28px 0 10px', font: 'var(--text-md)' },
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    value,
    defaultValue,
    options = [],
    label,
    size = 'md',
    disabled = false,
    full = false,
    width,
    onChange,
    onFocus,
    onBlur,
    style,
    containerStyle,
    children,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];
  const [focus, setFocus] = useState(false);

  const control = (
    <div
      style={{
        position: 'relative',
        width: full ? '100%' : width,
        display: 'inline-flex',
        ...containerStyle,
      }}
    >
      <select
        ref={ref}
        value={value}
        defaultValue={defaultValue}
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
          appearance: 'none',
          WebkitAppearance: 'none',
          width: full ? '100%' : width || 'auto',
          height: s.height,
          padding: s.padding,
          font: 'inherit',
          fontFamily: 'var(--font-sans)',
          fontSize: s.font,
          color: 'var(--color-text)',
          background: disabled ? 'var(--color-surface-alt)' : 'var(--color-surface)',
          border: `1px solid ${focus ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: focus ? '0 0 0 3px var(--color-accent-soft)' : 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition:
            'border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
          ...style,
        }}
        {...rest}
      >
        {children ??
          options.map((o) => {
            const opt = typeof o === 'string' ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--color-text-secondary)',
          display: 'inline-flex',
        }}
      >
        <Icon name="arrow_drop_down" size="md" />
      </span>
    </div>
  );

  if (label == null) return <span>{control}</span>;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--color-text)',
        }}
      >
        {label}
      </span>
      {control}
    </label>
  );
});

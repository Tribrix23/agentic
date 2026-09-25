import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  useState,
} from 'react';
import { Icon } from '../../Icon';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    checked = false,
    indeterminate = false,
    label,
    hint,
    disabled = false,
    onChange,
    style,
    ...rest
  },
  ref,
) {
  const on = checked || indeterminate;
  const [hover, setHover] = useState(false);

  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: hint != null ? 'flex-start' : 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      <span
        style={{
          flex: '0 0 auto',
          marginTop: hint != null ? 1 : 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: 3,
          background: on ? 'var(--color-accent)' : 'var(--color-surface)',
          border: `1.5px solid ${
            on
              ? 'var(--color-accent)'
              : hover && !disabled
                ? 'var(--color-text-secondary)'
                : 'var(--color-border-strong)'
          }`,
          color: '#fff',
          transition:
            'background var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)',
        }}
      >
        {on && (
          <Icon
            name={indeterminate ? 'remove' : 'check'}
            size={14}
            weight={700}
          />
        )}
      </span>
      {(label != null || hint != null) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {label != null && (
            <span style={{ fontSize: 'var(--text-md)', color: 'var(--color-text)', lineHeight: 1.3 }}>
              {label}
            </span>
          )}
          {hint != null && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {hint}
            </span>
          )}
        </span>
      )}
    </label>
  );
});

import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
} from 'react';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked = false, label, disabled = false, onChange, style, ...rest },
  ref,
) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      <span
        style={{
          position: 'relative',
          flex: '0 0 auto',
          width: 32,
          height: 18,
          borderRadius: 'var(--radius-pill)',
          background: checked ? 'var(--color-accent)' : 'var(--color-border-strong)',
          transition: 'background var(--motion-base) var(--ease-out)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: 'var(--shadow-1)',
            transition: 'left var(--motion-base) var(--ease-out)',
          }}
        />
      </span>
      {label != null && (
        <span style={{ fontSize: 'var(--text-md)', color: 'var(--color-text)' }}>{label}</span>
      )}
    </label>
  );
});

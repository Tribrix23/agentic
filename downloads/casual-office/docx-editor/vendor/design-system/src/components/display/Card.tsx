import {
  CSSProperties,
  forwardRef,
  HTMLAttributes,
  ReactNode,
  useState,
} from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Coloured top strip revealed on hover (e.g. file-type colour bar). */
  accent?: string;
  /** Lift + shadow on hover. */
  interactive?: boolean;
  padding?: number | string;
  children?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    children,
    accent,
    interactive = false,
    padding = 16,
    style,
    onMouseEnter,
    onMouseLeave,
    ...rest
  },
  ref,
) {
  const [hover, setHover] = useState(false);
  const lift = interactive && hover;

  const base: CSSProperties = {
    position: 'relative',
    background: 'var(--color-surface)',
    border: `1px solid ${lift ? accent ?? 'var(--color-border-strong)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-lg)',
    boxShadow: lift ? 'var(--shadow-2)' : 'var(--shadow-1)',
    padding,
    cursor: interactive ? 'pointer' : 'default',
    transform: lift ? 'translateY(-2px)' : 'none',
    transition:
      'transform var(--motion-base) var(--ease-out), box-shadow var(--motion-base) var(--ease-out), border-color var(--motion-base) var(--ease-out)',
    overflow: 'hidden',
  };

  return (
    <div
      ref={ref}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        setHover(false);
        onMouseLeave?.(e);
      }}
      style={{ ...base, ...style }}
      {...rest}
    >
      {accent && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: accent,
            opacity: lift ? 1 : 0,
            transition: 'opacity var(--motion-base) var(--ease-out)',
          }}
        />
      )}
      {children}
    </div>
  );
});

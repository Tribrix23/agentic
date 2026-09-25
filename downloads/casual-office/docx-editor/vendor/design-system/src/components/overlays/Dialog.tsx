import { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Icon } from '../../Icon';

export interface DialogProps {
  open?: boolean;
  title?: ReactNode;
  /** Leading Material Symbols ligature name shown beside the title. */
  icon?: string;
  children?: ReactNode;
  /** Right-aligned footer slot (typically a button row). */
  footer?: ReactNode;
  width?: number | string;
  onClose?: () => void;
  style?: CSSProperties;
}

export function Dialog({
  open = true,
  title,
  icon,
  children,
  footer,
  width = 440,
  onClose,
  style,
}: DialogProps) {
  if (!open) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="presentation"
      className="cs-anim-scrim"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-scrim)',
        backdropFilter: 'blur(3px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(3px) saturate(1.1)',
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className="cs-anim-rise"
        onClick={stop}
        style={{
          width,
          maxWidth: '100%',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-4)',
          overflow: 'hidden',
          ...style,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 12px 12px 16px',
            borderBottom: '1px solid var(--color-divider)',
          }}
        >
          {icon && (
            <Icon name={icon} size="lg" style={{ color: 'var(--color-accent)' } as CSSProperties} />
          )}
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-lg)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-text)',
            }}
          >
            {title}
          </span>
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                border: 0,
                background: 'transparent',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              <Icon name="close" size="lg" />
            </button>
          )}
        </div>
        <div
          style={{
            padding: 16,
            overflowY: 'auto',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-md)',
            color: 'var(--color-text-secondary)',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '12px 16px',
              borderTop: '1px solid var(--color-divider)',
              background: 'var(--color-surface)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

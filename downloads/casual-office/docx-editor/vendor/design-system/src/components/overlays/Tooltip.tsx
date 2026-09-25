import { CSSProperties, ReactNode, useState } from 'react';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  label: ReactNode;
  /** Optional keyboard shortcut shown in JetBrains Mono next to the label. */
  shortcut?: string;
  placement?: TooltipPlacement;
  children?: ReactNode;
  style?: CSSProperties;
}

const PLACEMENTS: Record<TooltipPlacement, CSSProperties> = {
  top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
  bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
  left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 6 },
  right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 },
};

export function Tooltip({
  label,
  shortcut,
  placement = 'top',
  children,
  style,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  const pos = PLACEMENTS[placement];

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className="cs-anim-fade"
          style={{
            position: 'absolute',
            zIndex: 1200,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            background: '#201f1e',
            color: '#fff',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-2)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            lineHeight: 1.3,
            pointerEvents: 'none',
            ...pos,
            ...style,
          }}
        >
          {label}
          {shortcut && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              {shortcut}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

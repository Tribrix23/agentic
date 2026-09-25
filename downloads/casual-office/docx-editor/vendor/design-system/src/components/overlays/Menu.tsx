import { CSSProperties, ReactNode, useState } from 'react';
import { Icon } from '../../Icon';

export interface MenuItem {
  label?: ReactNode;
  /** Material Symbols ligature name. */
  icon?: string;
  /** Shortcut chip rendered in JetBrains Mono, right-aligned. */
  shortcut?: string;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface MenuDivider {
  divider: true;
}

export interface MenuHeader {
  header: string;
}

export type MenuEntry = MenuItem | MenuDivider | MenuHeader;

export interface MenuProps {
  items: MenuEntry[];
  width?: number | string;
  style?: CSSProperties;
}

export function Menu({ items, width = 232, style }: MenuProps) {
  return (
    <div
      role="menu"
      className="cs-anim-pop"
      style={{
        width,
        padding: '5px 0',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-3)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-base)',
        color: 'var(--color-text)',
        ...style,
      }}
    >
      {items.map((entry, i) => {
        if ('divider' in entry) {
          return (
            <div
              key={i}
              style={{ height: 1, background: 'var(--color-divider)', margin: '4px 0' }}
            />
          );
        }
        if ('header' in entry) {
          return (
            <div
              key={i}
              style={{
                padding: '6px 12px 2px',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--color-text-muted)',
              }}
            >
              {entry.header}
            </div>
          );
        }
        return <MenuItemView key={i} item={entry} />;
      })}
    </div>
  );
}

function MenuItemView({ item }: { item: MenuItem }) {
  const [hover, setHover] = useState(false);
  const fg = item.danger ? 'var(--color-danger)' : 'var(--color-text)';
  const iconName = item.checked ? 'check' : item.icon ?? 'check';
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={item.onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        height: 30,
        padding: '0 12px',
        border: 0,
        background: hover && !item.disabled ? 'var(--color-hover)' : 'transparent',
        color: fg,
        font: 'inherit',
        textAlign: 'left',
        cursor: item.disabled ? 'not-allowed' : 'pointer',
        opacity: item.disabled ? 0.45 : 1,
      }}
    >
      <span
        style={{
          width: 18,
          display: 'inline-flex',
          visibility: item.icon || item.checked ? 'visible' : 'hidden',
          color: item.danger ? 'var(--color-danger)' : 'var(--color-text-secondary)',
        }}
      >
        <Icon name={iconName} size="md" />
      </span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.label}
      </span>
      {item.shortcut && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          {item.shortcut}
        </span>
      )}
    </button>
  );
}

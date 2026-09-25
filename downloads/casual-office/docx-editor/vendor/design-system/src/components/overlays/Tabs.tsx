import { CSSProperties, useState } from 'react';
import { Icon } from '../../Icon';

export interface TabDescriptor<V extends string = string> {
  value: V;
  label: string;
  /** Material Symbols ligature name. */
  icon?: string;
}

export interface TabsProps<V extends string = string> {
  tabs: TabDescriptor<V>[];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  style?: CSSProperties;
}

export function Tabs<V extends string = string>({
  tabs,
  value,
  defaultValue,
  onChange,
  style,
}: TabsProps<V>) {
  const [internal, setInternal] = useState<V | undefined>(defaultValue ?? tabs[0]?.value);
  const active = value !== undefined ? value : internal;
  const select = (v: V) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        borderBottom: '1px solid var(--color-divider)',
        ...style,
      }}
    >
      {tabs.map((t) => (
        <Tab key={t.value} tab={t} active={t.value === active} onClick={() => select(t.value)} />
      ))}
    </div>
  );
}

function Tab<V extends string>({
  tab,
  active,
  onClick,
}: {
  tab: TabDescriptor<V>;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 12px',
        border: 0,
        background: 'transparent',
        font: 'inherit',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-base)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        color: active
          ? 'var(--color-accent)'
          : hover
            ? 'var(--color-text)'
            : 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'color var(--motion-fast) var(--ease-out)',
      }}
    >
      {tab.icon && <Icon name={tab.icon} size="md" />}
      {tab.label}
      <span
        style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: -1,
          height: 2,
          borderRadius: '2px 2px 0 0',
          background: 'var(--color-accent)',
          opacity: active ? 1 : 0,
          transition: 'opacity var(--motion-fast) var(--ease-out)',
        }}
      />
    </button>
  );
}

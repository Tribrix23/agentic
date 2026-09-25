import { forwardRef, HTMLAttributes } from 'react';

const PALETTE = [
  '#0e7490',
  '#6d28d9',
  '#b91c1c',
  '#ea580c',
  '#15803d',
  '#0ea5e9',
  '#db2777',
  '#ca8a04',
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name?: string;
  src?: string;
  size?: number;
  /** Adds the green "active now" ring used for live co-editing peers. */
  active?: boolean;
  /** Override the deterministic palette colour. */
  color?: string;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name = '', src, size = 28, active = false, color, style, ...rest },
  ref,
) {
  const bg = color ?? colorFor(name);
  return (
    <span
      ref={ref}
      title={name}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: src ? 'transparent' : bg,
        color: '#fff',
        fontFamily: 'var(--font-sans)',
        fontSize: Math.round(size * 0.4),
        fontWeight: 'var(--weight-semibold)',
        lineHeight: 1,
        flex: '0 0 auto',
        boxShadow: active
          ? '0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-success)'
          : '0 0 0 2px var(--color-surface)',
        overflow: 'hidden',
        ...style,
      }}
      {...rest}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials(name)
      )}
    </span>
  );
});

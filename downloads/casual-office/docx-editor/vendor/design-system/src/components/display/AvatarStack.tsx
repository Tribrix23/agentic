import { CSSProperties, forwardRef } from 'react';
import { Avatar, AvatarProps } from './Avatar';

export type AvatarStackPerson = string | (Omit<AvatarProps, 'size'> & { name: string });

export interface AvatarStackProps {
  people?: AvatarStackPerson[];
  size?: number;
  /** Maximum avatars to render; the remainder collapses into a `+N` chip. */
  max?: number;
  style?: CSSProperties;
}

export const AvatarStack = forwardRef<HTMLSpanElement, AvatarStackProps>(function AvatarStack(
  { people = [], size = 28, max = 4, style },
  ref,
) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span ref={ref} style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {shown.map((p, i) => {
        const props = typeof p === 'string' ? { name: p } : p;
        return (
          <span
            key={i}
            style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: shown.length - i }}
          >
            <Avatar {...props} size={size} />
          </span>
        );
      })}
      {extra > 0 && (
        <span style={{ marginLeft: -size * 0.3, zIndex: 0 }}>
          <Avatar name={`+${extra}`} color="var(--color-text-secondary)" size={size} />
        </span>
      )}
    </span>
  );
});

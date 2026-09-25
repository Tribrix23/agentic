import { CSSProperties, forwardRef, HTMLAttributes } from 'react';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

const SIZE_PX: Record<Exclude<IconSize, number>, number> = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
};

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Material Symbols Outlined ligature name (e.g. `format_bold`, `cloud_done`). */
  name: string;
  /** Pixel size or named scale. Defaults to `md` (18px). */
  size?: IconSize;
  /** Filled variant. The icon font is variable; `filled` ramps the FILL axis to 1. */
  filled?: boolean;
  /** Adjust the weight axis (100..700). Defaults to 400. */
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
}

/**
 * Material Symbols Outlined ligature icon. Pass the ligature name (e.g.
 * `format_bold`) and the icon font renders the glyph in-place. Requires the
 * design system tokens stylesheet (`@schnsrw/design-system/tokens.css`) to
 * have been imported, which pulls the variable icon font from Google Fonts.
 */
export const Icon = forwardRef<HTMLSpanElement, IconProps>(function Icon(
  { name, size = 'md', filled = false, weight = 400, className, style, ...rest },
  ref,
) {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const fontVariationSettings = `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`;
  const merged: CSSProperties = {
    fontSize: px,
    lineHeight: 1,
    fontVariationSettings,
    ...style,
  };
  const classes = className
    ? `material-symbols-outlined ${className}`
    : 'material-symbols-outlined';
  return (
    <span ref={ref} aria-hidden="true" className={classes} style={merged} {...rest}>
      {name}
    </span>
  );
});

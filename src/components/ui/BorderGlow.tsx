import { useRef, useCallback, useState, useEffect, type ReactNode } from 'react';

interface BorderGlowProps {
  children?: ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  fillOpacity?: number;
}

function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildBoxShadow(glowColor: string, intensity: number): string {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const layers: [number, number, number, number, number, boolean][] = [
    [0, 0, 0, 1, 100, true], [0, 0, 1, 0, 60, true], [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true], [0, 0, 15, 0, 30, true], [0, 0, 25, 2, 20, true],
    [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false], [0, 0, 3, 0, 50, false], [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false], [0, 0, 25, 2, 20, false], [0, 0, 50, 2, 10, false],
  ];
  return layers.map(([x, y, blur, spread, alpha, inset]) => {
    const a = Math.min(alpha * intensity, 100);
    return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`;
  }).join(', ');
}

function linear(x: number) { return x; }

interface AnimateOpts {
  start?: number; end?: number; duration?: number; delay?: number;
  ease?: (t: number) => number; onUpdate: (v: number) => void; onEnd?: () => void;
}

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = linear, onUpdate, onEnd }: AnimateOpts) {
  const t0 = performance.now() + delay;
  let cancel = false;
  function tick() {
    if (cancel) return;
    const elapsed = performance.now() - t0;
    if (elapsed < 0) {
       requestAnimationFrame(tick);
       return;
    }
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  requestAnimationFrame(tick);
  return () => { cancel = true; };
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildMeshGradients(colors: string[]): string[] {
  const gradients: string[] = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    gradients.push(`radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`);
  }
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`);
  return gradients;
}

function isLightColor(color: string): boolean {
  const value = color.trim().replace('#', '');
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false;
  const hex = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 180;
}

const BorderGlow: React.FC<BorderGlowProps> = ({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  backgroundColor = '#120F17',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1.0,
  coneSpread = 25, // default was 25. Let's make it smaller if we need to.
  animated = false,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  fillOpacity = 0.5,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cursorAngle, setCursorAngle] = useState(45);
  const [edgeProximity, setEdgeProximity] = useState(0);
  const [sweepActive, setSweepActive] = useState(false);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver(() => {
      if (cardRef.current) {
        setDimensions({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
      }
    });
    ro.observe(cardRef.current);
    // initial set
    setDimensions({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!animated) {
      setSweepActive(false);
      return;
    }
    
    setSweepActive(true);
    let isCancelled = false;

    const runLoop = () => {
      if (isCancelled) return;
      const angleStart = 0;
      const angleEnd = 360;
      setEdgeProximity(1); // fully visible border
      
      const cancel = animateValue({ 
        ease: linear, 
        duration: 2000, 
        start: angleStart, 
        end: angleEnd, 
        onUpdate: v => setCursorAngle(v),
        onEnd: () => {
          if (!isCancelled) runLoop();
        }
      });
      return cancel;
    };

    const cancelFn = runLoop();
    return () => {
      isCancelled = true;
      if (cancelFn) cancelFn();
    };
  }, [animated]);

  const colorSensitivity = edgeSensitivity + 20;
  // ONLY glow when sweep is active (animated)
  const isVisible = sweepActive;
  const borderOpacity = isVisible
    ? Math.max(0, (edgeProximity * 100 - colorSensitivity) / (100 - colorSensitivity))
    : 0;
  const glowOpacity = isVisible
    ? Math.max(0, (edgeProximity * 100 - edgeSensitivity) / (100 - edgeSensitivity))
    : 0;

  const meshGradients = buildMeshGradients(colors);
  const borderBg = meshGradients.map(g => `${g} border-box`);
  const fillBg = meshGradients.map(g => `${g} padding-box`);
  const lightSurface = isLightColor(backgroundColor);
  
  let px = 0;
  let py = 0;
  let spotRadius = 45; // Default comet size
  if (dimensions.w > 0 && dimensions.h > 0) {
    const w = dimensions.w;
    const h = dimensions.h;
    const perimeter = 2 * w + 2 * h;
    const progress = cursorAngle / 360;
    const p = progress * perimeter;
    if (p <= w) { px = p; py = 0; }
    else if (p <= w + h) { px = w; py = p - w; }
    else if (p <= 2 * w + h) { px = w - (p - (w + h)); py = h; }
    else { px = 0; py = h - (p - (2 * w + h)); }
    
    // Prevent the spot from bleeding to the opposite edge on thin boxes
    spotRadius = Math.min(80, h * 0.7, w * 0.7);
  }

  return (
    <div
      ref={cardRef}
      className={`relative grid isolate border ${className}`}
      style={{
        background: backgroundColor,
        borderColor: lightSurface ? 'rgb(24 24 27 / 12%)' : 'rgb(255 255 255 / 15%)',
        borderRadius: `${borderRadius}px`,
        transform: 'translate3d(0, 0, 0.01px)',
        boxShadow: lightSurface
          ? 'rgb(24 24 27 / 4%) 0 1px 2px, rgb(24 24 27 / 5%) 0 8px 24px'
          : 'rgba(0,0,0,0.1) 0 1px 2px, rgba(0,0,0,0.1) 0 2px 4px, rgba(0,0,0,0.1) 0 4px 8px, rgba(0,0,0,0.1) 0 8px 16px, rgba(0,0,0,0.1) 0 16px 32px, rgba(0,0,0,0.1) 0 32px 64px',
      }}
    >
      {/* mesh gradient border */}
      <div
        className="absolute inset-0 rounded-[inherit] -z-[1]"
        style={{
          border: '1px solid transparent',
          background: [
            `linear-gradient(${backgroundColor} 0 100%) padding-box`,
            'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
            ...borderBg,
          ].join(', '),
          opacity: borderOpacity,
          maskImage: `radial-gradient(circle at ${px}px ${py}px, black 0%, transparent ${spotRadius}px)`,
          WebkitMaskImage: `radial-gradient(circle at ${px}px ${py}px, black 0%, transparent ${spotRadius}px)`,
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        }}
      />

      {/* mesh gradient fill near edges */}
      <div
        className="absolute inset-0 rounded-[inherit] -z-[1]"
        style={{
          border: '1px solid transparent',
          background: fillBg.join(', '),
          maskImage: [
            'linear-gradient(to bottom, black, black)',
            'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
            'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
            `radial-gradient(circle at ${px}px ${py}px, transparent 0%, black ${spotRadius}px)`,
          ].join(', '),
          WebkitMaskImage: [
            'linear-gradient(to bottom, black, black)',
            'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
            'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
            `radial-gradient(circle at ${px}px ${py}px, transparent 0%, black ${spotRadius}px)`,
          ].join(', '),
          maskComposite: 'subtract, add, add, add, add, add',
          WebkitMaskComposite: 'source-out, source-over, source-over, source-over, source-over, source-over',
          opacity: borderOpacity * fillOpacity,
          mixBlendMode: lightSurface ? 'normal' : 'soft-light',
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        } as React.CSSProperties}
      />

      {/* outer glow */}
      <span
        className="absolute pointer-events-none z-[1] rounded-[inherit]"
        style={{
          inset: `${-glowRadius}px`,
          maskImage: `radial-gradient(circle at ${px + glowRadius}px ${py + glowRadius}px, black 0%, transparent ${spotRadius}px)`,
          WebkitMaskImage: `radial-gradient(circle at ${px + glowRadius}px ${py + glowRadius}px, black 0%, transparent ${spotRadius}px)`,
          opacity: glowOpacity,
          mixBlendMode: lightSurface ? 'normal' : 'plus-lighter',
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        } as React.CSSProperties}
      >
        <span
          className="absolute rounded-[inherit]"
          style={{
            inset: `${glowRadius}px`,
            boxShadow: buildBoxShadow(glowColor, glowIntensity),
          }}
        />
      </span>

      <div className="flex flex-col relative overflow-visible z-[1] w-full h-full">
        {children}
      </div>
    </div>
  );
};

export default BorderGlow;

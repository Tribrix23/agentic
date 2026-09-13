import { useEffect, useRef, useState } from 'react';

interface PixelTransitionOverlayProps {
  /** 'in' = black pixels cover screen, 'out' = black pixels uncover screen, 'idle' = hidden */
  phase: 'idle' | 'in' | 'out';
  pixelSize?: number;
  duration?: number;
  onComplete?: () => void;
}

interface Pixel {
  id: number;
  x: number;
  y: number;
  delay: number;
}

export default function PixelTransitionOverlay({
  phase,
  pixelSize = 80,
  duration = 600,
  onComplete
}: PixelTransitionOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhase = useRef<string>('idle');

  // Build the pixel grid on mount and resize
  useEffect(() => {
    const build = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cols = Math.ceil(w / pixelSize);
      const rows = Math.ceil(h / pixelSize);
      const total = cols * rows;
      const list: Pixel[] = [];
      for (let i = 0; i < total; i++) {
        list.push({
          id: i,
          x: (i % cols) * pixelSize,
          y: Math.floor(i / cols) * pixelSize,
          delay: Math.random()
        });
      }
      setPixels(list);
    };
    build();
    window.addEventListener('resize', build);
    return () => window.removeEventListener('resize', build);
  }, [pixelSize]);

  useEffect(() => {
    if (phase === prevPhase.current) return;
    prevPhase.current = phase;

    if (phase === 'idle') {
      setAnimating(false);
      return;
    }

    setAnimating(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setAnimating(false);
      onComplete?.();
    }, duration + 300); // +300 for the max random stagger

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, duration, onComplete]);

  if (!animating && phase === 'idle') return null;

  const spread = 300; // ms of stagger across all pixels

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {pixels.map(pixel => {
        const delay = pixel.delay * spread;
        const isIn = phase === 'in';
        return (
          <div
            key={pixel.id}
            style={{
              position: 'absolute',
              left: pixel.x,
              top: pixel.y,
              width: pixelSize,
              height: pixelSize,
              backgroundColor: '#000',
              transform: isIn ? 'scale(0)' : 'scale(1)',
              animation: `pixel-${isIn ? 'in' : 'out'} ${duration}ms ease-in-out ${delay}ms both`,
            }}
          />
        );
      })}
    </div>
  );
}

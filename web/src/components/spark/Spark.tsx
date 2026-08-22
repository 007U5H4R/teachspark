import { useEffect, useRef, useState } from 'react';
import { eyeOffset, idlePointer, lerp, orbTilt, resolveEyeState, starPath, type Mood, type Point } from './eyes.ts';
import './Spark.css';

// Geometry in SVG user units (viewBox 0 0 400 400).
const VB = 400;
const CENTER: Point = { x: 200, y: 190 };
const EYES: Point[] = [{ x: 160, y: 182 }, { x: 240, y: 182 }];
const MAX_EYE_OFFSET = 14;
const MAX_TILT_DEG = 7;

export interface SparkProps {
  mood?: Mood;         // driven by the page: 'starry' on /joined or CTA hover, 'happy' after submit
  size?: number;       // CSS max width in px; the SVG scales to its container
  blinkEveryMs?: number; // fixed cadence (tests); default = random 3–6s
  className?: string;
}

function Eye({ cx, cy, side }: { cx: number; cy: number; side: 'left' | 'right' }) {
  const tilt = side === 'left' ? -6 : 6;
  return (
    <g data-eye={side}>
      <rect className="spark__eye-shape spark__eye-shape--default" x={cx - 18} y={cy - 31} width={36} height={62} rx={16} fill="#fff" />
      <g className="spark__eye-shape spark__eye-shape--puppy" transform={`rotate(${tilt} ${cx} ${cy})`}>
        <rect x={cx - 23} y={cy - 38} width={46} height={76} rx={22} fill="#fff" />
        <circle cx={cx - 8} cy={cy - 20} r={6} fill="#b6ff3b" />
      </g>
      <path className="spark__eye-shape spark__eye-shape--starry" d={starPath(cx, cy, 34, 14)} fill="#fff" />
      <rect className="spark__eye-shape spark__eye-shape--blink" x={cx - 20} y={cy - 3} width={40} height={6} rx={3} fill="#fff" />
      <path className="spark__eye-shape spark__eye-shape--happy" d={`M ${cx - 22} ${cy + 8} Q ${cx} ${cy - 24} ${cx + 22} ${cy + 8}`} stroke="#fff" strokeWidth={9} strokeLinecap="round" fill="none" />
    </g>
  );
}

export function Spark({ mood = 'default', size = 460, blinkEveryMs, className }: SparkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [blinking, setBlinking] = useState(false);

  // Blink: a short squash on a loose cadence.
  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = blinkEveryMs ?? 3000 + Math.random() * 3000;
      closeTimer = setTimeout(() => {
        setBlinking(true);
        openTimer = setTimeout(() => { setBlinking(false); schedule(); }, 140);
      }, wait);
    };
    schedule();
    return () => { clearTimeout(closeTimer); clearTimeout(openTimer); };
  }, [blinkEveryMs]);

  // Gaze: follow the pointer (hover devices) or wander (touch). Eased every frame, written straight
  // to the DOM so tracking never re-renders React.
  useEffect(() => {
    const svg = svgRef.current;
    const eyes = eyesRef.current;
    if (!svg || !eyes || typeof window.matchMedia !== 'function') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // blinks only
    const canHover = window.matchMedia('(hover: hover)').matches;

    let target: Point | null = null;
    const current = { ex: 0, ey: 0, rx: 0, ry: 0 };
    let raf = 0;
    const start = performance.now();

    const toSvg = (clientX: number, clientY: number): Point => {
      const r = svg.getBoundingClientRect();
      const s = r.width / VB || 1;
      return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
    };
    const onMove = (e: PointerEvent) => { target = toSvg(e.clientX, e.clientY); };
    const onLeave = () => { target = null; };
    if (canHover) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave); // cursor left the window: relax the gaze
    }

    const tick = (now: number) => {
      const p = canHover ? target : idlePointer(now - start, CENTER);
      // Both eyes share one offset (computed from the midpoint) so they never cross.
      const mid = { x: (EYES[0]!.x + EYES[1]!.x) / 2, y: EYES[0]!.y };
      const o = eyeOffset(mid, p, MAX_EYE_OFFSET);
      const t = orbTilt(CENTER, p, MAX_TILT_DEG);
      current.ex = lerp(current.ex, o.x, 0.18);
      current.ey = lerp(current.ey, o.y, 0.18);
      current.rx = lerp(current.rx, t.rx, 0.12);
      current.ry = lerp(current.ry, t.ry, 0.12);
      eyes.setAttribute('transform', `translate(${current.ex.toFixed(2)} ${current.ey.toFixed(2)})`);
      svg.style.transform = `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const state = resolveEyeState({ mood, hovered, blinking });
  return (
    <div className={['spark', className].filter(Boolean).join(' ')} style={{ maxWidth: size }} data-state={state}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg ref={svgRef} className="spark__svg" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Spark, the TeachSpark mascot — a green orb with big eyes that follow your cursor">
        <defs>
          <radialGradient id="spark-body" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#2fd65f" />
            <stop offset="45%" stopColor="#169a3c" />
            <stop offset="100%" stopColor="#062b14" />
          </radialGradient>
          <radialGradient id="spark-gloss" cx="30%" cy="22%" r="45%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="spark-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1f8a3a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="spark-blur" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <ellipse cx="200" cy="372" rx="120" ry="16" fill="url(#spark-shadow)" filter="url(#spark-blur)" />
        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill="url(#spark-body)" />
        <ellipse cx="150" cy="110" rx="70" ry="48" fill="url(#spark-gloss)" />
        <g ref={eyesRef} className="spark__eyes">
          <Eye cx={EYES[0]!.x} cy={EYES[0]!.y} side="left" />
          <Eye cx={EYES[1]!.x} cy={EYES[1]!.y} side="right" />
        </g>
      </svg>
    </div>
  );
}

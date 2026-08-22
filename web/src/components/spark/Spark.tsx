import { useEffect, useId, useRef, useState } from 'react';
import { eyeOffset, idlePointer, lerp, orbTilt, resolveEyeState, starPath, type Mood, type Point } from './eyes.ts';
import './Spark.css';

// Geometry in SVG user units (viewBox 0 0 400 400).
const VB = 400;
const CENTER: Point = { x: 200, y: 190 };
const EYES: Point[] = [{ x: 160, y: 182 }, { x: 240, y: 182 }];
const MAX_EYE_OFFSET = 14;
const MAX_TILT_DEG = 7;
// Easing factors expressed at 60 Hz; `tick` rescales them to the real frame delta.
const EYE_EASE_60 = 0.18;
const TILT_EASE_60 = 0.12;
const FRAME_60_MS = 1000 / 60;

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

  // Gradient/filter ids must be unique per instance: two <Spark /> on one page would otherwise
  // emit duplicate ids and every instance would resolve url(#…) to the first <defs>.
  // React 19's useId contains delimiters that are not valid in a URL fragment, so strip them.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyId = `spark-body-${uid}`;
  const glossId = `spark-gloss-${uid}`;
  const shadowId = `spark-shadow-${uid}`;
  const blurId = `spark-blur-${uid}`;
  const hazeId = `spark-haze-${uid}`;
  const rimId = `spark-rim-${uid}`;
  const haloId = `spark-halo-${uid}`;
  const edgeId = `spark-edge-${uid}`;
  const reflectBlurId = `spark-rblur-${uid}`;

  // Blink: a short squash on a loose cadence.
  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    // A cadence change mid-blink clears the pending open timer, so re-open first or the
    // eyes stay shut until the next cycle.
    setBlinking(false);
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
    if (reduced) return; // blinks only — nothing below this line is registered
    const canHover = window.matchMedia('(hover: hover)').matches;

    // Raw client coords only; the SVG-space conversion happens in `tick` against a cached
    // rect so neither the event nor the frame ever forces a layout.
    let client: Point | null = null;
    let rect = svg.getBoundingClientRect();
    const measure = () => { rect = svg.getBoundingClientRect(); };

    const current = { ex: 0, ey: 0, rx: 0, ry: 0 };
    let raf = 0;
    let visible = true;
    // Both of these live on the rAF clock and are seeded from the first frame's timestamp.
    // Do NOT seed them from performance.now(): the two are not guaranteed to share a time
    // origin (under jsdom they differ by ~700ms), and the resulting negative dt would make
    // the easing factor negative and fling the gaze the wrong way.
    let last = 0;  // 0 = next frame is the first
    let start = 0; // origin for the idle drift's phase

    const toSvg = (c: Point): Point | null => {
      // A zero-width measurement (display:none, pre-layout) would make the scale meaningless
      // and read client pixels as user units, pinning the eyes hard right. Treat as no pointer.
      if (rect.width <= 0) return null;
      const s = rect.width / VB;
      return { x: (c.x - rect.left) / s, y: (c.y - rect.top) / s };
    };
    const onMove = (e: PointerEvent) => { client = { x: e.clientX, y: e.clientY }; };
    const onLeave = () => { client = null; }; // cursor left the window / tab hidden: relax the gaze

    const tick = (now: number) => {
      if (!visible) { raf = 0; return; } // parked off-screen; the observer restarts us
      if (start === 0) start = now;
      // Clamp BOTH ends: the upper bound stops a backgrounded tab handing back a huge delta,
      // and the lower bound is load-bearing — a negative dt would make Math.pow return >1 and
      // the easing factor negative, which overshoots away from the target instead of easing.
      const dt = last === 0 ? FRAME_60_MS : Math.min(Math.max(now - last, 0), 100);
      last = now;
      // Frame-rate independent easing, so 120 Hz does not converge twice as fast as 60 Hz.
      const ke = 1 - Math.pow(1 - EYE_EASE_60, dt / FRAME_60_MS);
      const kt = 1 - Math.pow(1 - TILT_EASE_60, dt / FRAME_60_MS);
      const p = canHover ? (client && toSvg(client)) : idlePointer(now - start, CENTER);
      // Both eyes share one offset (computed from the midpoint) so they never cross.
      const mid = { x: (EYES[0]!.x + EYES[1]!.x) / 2, y: EYES[0]!.y };
      const o = eyeOffset(mid, p, MAX_EYE_OFFSET);
      const t = orbTilt(CENTER, p, MAX_TILT_DEG);
      current.ex = lerp(current.ex, o.x, ke);
      current.ey = lerp(current.ey, o.y, ke);
      current.rx = lerp(current.rx, t.rx, kt);
      current.ry = lerp(current.ry, t.ry, kt);
      eyes.setAttribute('transform', `translate(${current.ex.toFixed(2)} ${current.ey.toFixed(2)})`);
      svg.style.transform = `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    const startLoop = () => {
      if (raf) return; // already running
      last = 0; // don't bill the parked interval as one giant frame (`start` keeps the drift phase)
      raf = requestAnimationFrame(tick);
    };

    if (canHover) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('resize', measure, { passive: true });
      window.addEventListener('scroll', measure, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
      window.addEventListener('blur', onLeave);
      document.addEventListener('visibilitychange', onLeave);
    }

    // Park the loop while the orb is off-screen: on touch the idle drift would otherwise burn
    // frames for the whole session on exactly the phones least able to afford it.
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        visible = entry.isIntersecting;
        if (visible) startLoop();
      });
      observer.observe(svg);
    }

    startLoop();
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      observer?.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const state = resolveEyeState({ mood, hovered, blinking });
  return (
    <div className={['spark', className].filter(Boolean).join(' ')} style={{ maxWidth: size }} data-state={state}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg ref={svgRef} className="spark__svg" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Spark, the TeachSpark mascot">
        <defs>
          {/* Glass, not paint. Every fill below is partly transparent, so the page background
              reads through the sphere — that is what sells it as a translucent object rather
              than a solid ball. The light source is upper-left; the green is a glow INSIDE the
              sphere, low and central, not a surface colour. */}
          <radialGradient id={bodyId} cx="47%" cy="57%" r="96%">
            <stop offset="0%" stopColor="#54ff92" stopOpacity="0.44" />
            <stop offset="16%" stopColor="#2ecf66" stopOpacity="0.38" />
            <stop offset="36%" stopColor="#179544" stopOpacity="0.33" />
            <stop offset="60%" stopColor="#0d5b2b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0a2b18" stopOpacity="0.32" />
          </radialGradient>
          {/* Cool haze across the upper half: glass desaturates toward grey where it is lit from
              outside rather than glowing from within. */}
          <radialGradient id={hazeId} cx="42%" cy="15%" r="72%">
            <stop offset="0%" stopColor="#e8f4ec" stopOpacity="0.26" />
            <stop offset="42%" stopColor="#95b8a4" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          {/* Soft edge falloff. A stroke alone reads as a drawn outline; this radial ramp inside
              the last 12% of the radius is what makes the edge look like light on curved glass. */}
          <radialGradient id={edgeId} cx="50%" cy="50%" r="50%">
            <stop offset="84%" stopColor="#e6fff0" stopOpacity="0" />
            <stop offset="96%" stopColor="#e6fff0" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.24" />
          </radialGradient>
          {/* Rim light. The bright edge is the single strongest cue that a sphere is glass —
              brightest upper-left where the key light grazes it, with a dimmer bounce lower-right. */}
          <linearGradient id={rimId} x1="12%" y1="4%" x2="88%" y2="98%">
            <stop offset="0%" stopColor="#f6fffa" stopOpacity="0.62" />
            <stop offset="26%" stopColor="#a5e6bd" stopOpacity="0.16" />
            <stop offset="60%" stopColor="#2c6f45" stopOpacity="0.05" />
            <stop offset="86%" stopColor="#8fdcac" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#d8fbe6" stopOpacity="0.34" />
          </linearGradient>
          {/* Atmospheric bloom so the sphere separates from a near-black page. */}
          <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#1cb14a" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1cb14a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={glossId} cx="32%" cy="24%" r="42%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* Reflected pool, not a cast shadow: the sphere floats above a dark glossy surface. */}
          <radialGradient id={shadowId} cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#3ee071" stopOpacity="0.34" />
            <stop offset="34%" stopColor="#17903f" stopOpacity="0.2" />
            <stop offset="70%" stopColor="#0a3d1d" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id={blurId} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id={reflectBlurId} x="-40%" y="-120%" width="180%" height="340%"><feGaussianBlur stdDeviation="20" /></filter>
        </defs>
        <circle cx={CENTER.x} cy={CENTER.y} r="196" fill={`url(#${haloId})`} />
        <ellipse cx="200" cy="368" rx="132" ry="30" fill={`url(#${shadowId})`} filter={`url(#${reflectBlurId})`} />
        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill={`url(#${bodyId})`} />
        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill={`url(#${hazeId})`} />
        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill={`url(#${edgeId})`} />
        <circle cx={CENTER.x} cy={CENTER.y} r="149" fill="none" stroke={`url(#${rimId})`} strokeWidth="1.6" />
        <ellipse cx="152" cy="112" rx="66" ry="44" fill={`url(#${glossId})`} />
        <g ref={eyesRef} className="spark__eyes">
          <Eye cx={EYES[0]!.x} cy={EYES[0]!.y} side="left" />
          <Eye cx={EYES[1]!.x} cy={EYES[1]!.y} side="right" />
        </g>
      </svg>
    </div>
  );
}

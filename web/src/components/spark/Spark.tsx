import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { eyeOffset, heartPath, idlePointer, orbTilt, resolveEyeState, spiralPath, starPath, type Mood, type Point } from './eyes.ts';
import { applyBlink, eyePath, lerpShape, NEUTRAL, shapeFor, type Behavior, type EyeShape } from './eyeShape.ts';
import { breathe, lookAround, saccade, smoothSpeed, stepSpring, tuningForSpeed, type Spring } from './gaze.ts';
import { activeBehavior, BEHAVIORS, initialMachine, release, request, setBase, tick, type Machine } from './sparkState.ts';
import { blinkAmount, planBlink, type BlinkPlan } from './blink.ts';
import './Spark.css';

// Geometry in SVG user units (viewBox 0 0 400 400).
const VB = 400;
const CENTER: Point = { x: 200, y: 190 };
const EYES: Point[] = [{ x: 160, y: 182 }, { x: 240, y: 182 }];
const MAX_EYE_OFFSET = 14;
const MAX_TILT_DEG = 7;
const TILT_EASE_60 = 0.12;
const FRAME_60_MS = 1000 / 60;

const SLEEP_AFTER_MS = 45_000;
const LOOK_AROUND_AFTER_MS = 9_000;
const LOOK_AROUND_EVERY_MS = 14_000;

export interface SparkProps {
  mood?: Mood;           // driven by the page: 'starry' on /joined or CTA hover, 'happy' after submit
  size?: number;         // CSS max width in px; the SVG scales to its container
  blinkEveryMs?: number; // fixed cadence (tests); default = a varied, weighted schedule
  className?: string;
  /**
   * Calm mode. On /join the orb sits beside a form the teacher is filling in, and an orb that
   * gets curious, thinks and falls asleep there competes with the one conversion that page
   * exists for. Calm keeps gaze + blink and drops the rest.
   */
  expressive?: boolean;
  /** Pin the eyes to one expression and centre the gaze — for the expression preview/gallery. */
  hold?: Behavior;
  ref?: Ref<SparkHandle>;
}

/** Imperative so a page can react to a real event without re-rendering the orb. */
export interface SparkHandle {
  signal(behavior: Behavior): void;
  clear(behavior: Behavior): void;
}

function Eye({ cx, cy, side }: { cx: number; cy: number; side: 'left' | 'right' }) {
  const tilt = side === 'left' ? -6 : 6;
  const p = eyePath(NEUTRAL, cx, cy, side);
  return (
    <g data-eye={side}>
      {/* The neutral eye is now a parametric path the animation loop rewrites each frame (a path so
          it can bow into happy/sad crescents); the drawn expressions below cross-fade over it by
          data-state. */}
      <path className="spark__eye-shape spark__eye-shape--default" d={p.d} fill="#fff" />
      <g className="spark__eye-shape spark__eye-shape--puppy" transform={`rotate(${tilt} ${cx} ${cy})`}>
        <rect x={cx - 23} y={cy - 38} width={46} height={76} rx={22} fill="#fff" />
        <circle cx={cx - 8} cy={cy - 20} r={6} fill="#b6ff3b" />
      </g>
      {/* Two golden sparkles per eye — a big one, plus a small one to the upper-right (like the
          classic "star-struck" look). Both in one path so the twinkle animation applies to them
          together. */}
      <path
        className="spark__eye-shape spark__eye-shape--starry"
        d={`${starPath(cx - 3, cy + 3, 33, 8.5, 4)} ${starPath(cx + 21, cy - 21, 12, 3.2, 4)}`}
        fill="var(--gold)"
      />
      <path className="spark__eye-shape spark__eye-shape--happy" d={`M ${cx - 22} ${cy + 8} Q ${cx} ${cy - 24} ${cx + 22} ${cy + 8}`} stroke="#fff" strokeWidth={9} strokeLinecap="round" fill="none" />
      {/* Heart eyes — a red, gently-beating heart per eye. */}
      <path className="spark__eye-shape spark__eye-shape--love" d={heartPath(cx, cy - 2, 22)} fill="#ff4d6d" />
      {/* Dizzy eyes — a blue spiral per eye, spun by CSS. */}
      <path className="spark__eye-shape spark__eye-shape--dizzy" d={spiralPath(cx, cy, 20)} stroke="#4aa3ff" strokeWidth={5} strokeLinecap="round" fill="none" />
      {/* Money eyes — a gold currency glyph. */}
      <text className="spark__eye-shape spark__eye-shape--money" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={58} fontWeight={800} fontFamily="Inter, system-ui, sans-serif" fill="var(--gold)">$</text>
      {/* Confused — a light-blue question mark. */}
      <text className="spark__eye-shape spark__eye-shape--confused" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={58} fontWeight={800} fontFamily="Inter, system-ui, sans-serif" fill="#8fd0ff">?</text>
      {/* Dead — crossed-out "X" eyes. */}
      <path className="spark__eye-shape spark__eye-shape--dead" d={`M ${cx - 15} ${cy - 15} L ${cx + 15} ${cy + 15} M ${cx + 15} ${cy - 15} L ${cx - 15} ${cy + 15}`} stroke="#e5e5e5" strokeWidth={7} strokeLinecap="round" fill="none" />
    </g>
  );
}

export function Spark({ mood = 'default', size = 460, blinkEveryMs, className, expressive = true, hold, ref }: SparkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [behavior, setBehavior] = useState<Behavior>('tracking');

  // The machine lives in a ref so the loop can mutate it without re-rendering; `setBehavior`
  // mirrors it to an attribute only when it actually changes.
  const machineRef = useRef<Machine>(initialMachine());
  const blinkRef = useRef<{ start: number; plan: BlinkPlan } | null>(null);
  const expressiveRef = useRef(expressive);
  expressiveRef.current = expressive;
  const holdRef = useRef(hold);
  holdRef.current = hold;

  useImperativeHandle(ref, () => ({
    signal(b) { machineRef.current = request(machineRef.current, b, performance.now()); },
    clear(b) { machineRef.current = release(machineRef.current, b); },
  }), []);

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

  // Blink scheduling. Timers own WHEN; the rAF loop below owns how it looks, reading the plan so
  // the lid eases rather than snapping. `blinkEveryMs` keeps the exact deterministic shape the
  // tests pin: close at the interval, open 140ms later.
  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout> | undefined;
    setBlinking(false);
    const schedule = () => {
      const plan = planBlink(Math.random, blinkEveryMs);
      const firstClose = plan.beats[0]![0];
      const lastOpen = plan.beats[plan.beats.length - 1]![1];
      const wait = blinkEveryMs ?? plan.nextAtMs - lastOpen;
      closeTimer = setTimeout(() => {
        blinkRef.current = { start: performance.now(), plan };
        setBlinking(true);
        openTimer = setTimeout(() => {
          blinkRef.current = null;
          setBlinking(false);
          schedule();
        }, lastOpen - firstClose);
      }, wait);
    };
    schedule();
    return () => { clearTimeout(closeTimer); clearTimeout(openTimer); };
  }, [blinkEveryMs]);

  // One loop drives gaze, shape and tilt, writing straight to the DOM. Nothing here re-renders
  // React — that property is why pointer movement stays free.
  useEffect(() => {
    const svg = svgRef.current;
    const eyes = eyesRef.current;
    if (!svg || !eyes || typeof window.matchMedia !== 'function') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canHover = window.matchMedia('(hover: hover)').matches;
    const eyePaths = Array.from(svg.querySelectorAll<SVGPathElement>('.spark__eye-shape--default'));
    if (eyePaths.length !== 2) return;

    // Reduced motion keeps a gentle gaze instead of freezing: losing the tracking entirely also
    // loses the feedback that the orb is a live element. Amplitude drops, extras go.
    const amp = reduced ? 0.4 : 1;

    let client: Point | null = null;
    let rect = svg.getBoundingClientRect();
    const measure = () => { rect = svg.getBoundingClientRect(); };

    let spring: Spring = { x: 0, y: 0, vx: 0, vy: 0 };
    let shape: EyeShape = { ...NEUTRAL };
    let tiltX = 0;
    let tiltY = 0;
    let speed = 0;
    let prevPointer: Point | null = null;
    let raf = 0;
    let visible = true;
    let last = 0;
    let start = 0;
    let lastPointerMs = 0;
    let seenPointer = false;
    let lookStart = 0;
    let lastLookMs = 0;
    let lastState = '';

    const onMove = (e: PointerEvent) => {
      client = { x: e.clientX, y: e.clientY };
      lastPointerMs = performance.now();
      if (!seenPointer) {
        seenPointer = true;
        // "I noticed you." Only once per mount, and only when the orb can actually be seen.
        if (expressiveRef.current && visible && !reduced) {
          machineRef.current = request(machineRef.current, 'attention', lastPointerMs);
        }
      }
      if (machineRef.current.base === 'sleeping') {
        machineRef.current = setBase(machineRef.current, 'tracking');
        if (expressiveRef.current) machineRef.current = request(machineRef.current, 'waking', lastPointerMs);
      }
    };
    const onLeave = () => { client = null; };

    const gazeTarget = (b: Behavior, now: number, maxOff: number): Point => {
      const mode = BEHAVIORS[b].gaze;
      const reach = BEHAVIORS[b].reach * maxOff;
      switch (mode) {
        case 'up':
          // Thinking: off the cursor, up and to one side, with slow shifts rather than a hold.
          return { x: Math.sin(now / 1400) * reach * 0.55, y: -reach * 0.8 };
        case 'down':
          return { x: -reach * 0.25, y: reach * 0.9 };
        case 'away':
          return { x: reach * 0.85, y: -reach * 0.2 };
        case 'rest':
          return { x: 0, y: reach };
        case 'hold':
          return { x: spring.x, y: spring.y };
        case 'cursor':
        default: {
          const mid = { x: (EYES[0]!.x + EYES[1]!.x) / 2, y: EYES[0]!.y };
          const p = canHover ? (client && toSvg(client)) : idlePointer(now - start, CENTER);
          return eyeOffset(mid, p, reach);
        }
      }
    };

    const toSvg = (c: Point): Point | null => {
      // A zero-width measurement (display:none, pre-layout) would make the scale meaningless
      // and read client pixels as user units, pinning the eyes hard right. Treat as no pointer.
      if (rect.width <= 0) return null;
      const s = rect.width / VB;
      return { x: (c.x - rect.left) / s, y: (c.y - rect.top) / s };
    };

    const tickFrame = (now: number) => {
      if (!visible) { raf = 0; return; }
      if (start === 0) { start = now; lastPointerMs = now; lastLookMs = now; }
      const dt = last === 0 ? FRAME_60_MS : Math.min(Math.max(now - last, 0), 100);
      last = now;
      const dts = dt / 1000;

      let m = tick(machineRef.current, now);

      if (expressiveRef.current && !reduced) {
        const idleFor = now - lastPointerMs;
        if (idleFor > SLEEP_AFTER_MS && !m.overlay) m = setBase(m, 'sleeping');
        // A rare glance around while dwelling — often enough to feel alive, rare enough not to nag.
        if (m.base === 'tracking' && !m.overlay && idleFor > LOOK_AROUND_AFTER_MS && now - lastLookMs > LOOK_AROUND_EVERY_MS && lookStart === 0) {
          lookStart = now;
        }
      }
      machineRef.current = m;

      // `hold` (preview mode) pins one expression and ignores the machine entirely.
      const b = holdRef.current ?? activeBehavior(m);
      if (b !== lastState) { lastState = b; setBehavior(b); }

      // Pointer speed drives how eagerly the spring reacts.
      const pointerSvg = canHover && client ? toSvg(client) : null;
      if (pointerSvg && prevPointer) speed = smoothSpeed(speed, pointerSvg.x - prevPointer.x, pointerSvg.y - prevPointer.y, dts);
      prevPointer = pointerSvg;

      // Held preview eyes rest centred; otherwise follow the behaviour's gaze.
      let target = holdRef.current ? { x: 0, y: 0 } : gazeTarget(b, now, MAX_EYE_OFFSET * amp);

      // The idle glance overrides the resting gaze, then hands control straight back.
      if (lookStart !== 0) {
        const l = lookAround(now - lookStart, MAX_EYE_OFFSET * amp);
        if (l.done) { lookStart = 0; lastLookMs = now; }
        else target = { x: l.x, y: l.y };
      }

      const tune = reduced ? { stiffness: 90, damping: 26 } : tuningForSpeed(speed);
      spring = stepSpring(spring, target.x, target.y, dts, tune.stiffness, tune.damping);

      // Micro-saccades ride on top of the settled gaze, never on the spring's own state, so they
      // cannot accumulate into drift.
      const s = reduced ? { x: 0, y: 0 } : saccade(now);
      const bob = b === 'thinking' || b === 'sleeping' ? breathe(now, reduced ? 0 : 1.2, 3400) : 0;
      eyes.setAttribute('transform', `translate(${(spring.x + s.x).toFixed(2)} ${(spring.y + s.y + bob).toFixed(2)})`);

      // Shape eases toward the active behaviour's target, then the blink collapses whatever it is.
      const want = shapeFor(b);
      shape = lerpShape(shape, want, 1 - Math.pow(1 - 0.12, dt / FRAME_60_MS));
      const bl = blinkRef.current ? blinkAmount(blinkRef.current.plan, now - blinkRef.current.start) : 0;
      const drawn = applyBlink(shape, bl);
      const winkSide = BEHAVIORS[b].wink; // shut just one eye for a wink
      for (let i = 0; i < 2; i++) {
        const el = eyePaths[i]!;
        const side = i === 0 ? 'left' : 'right';
        const sideShape = winkSide === side ? applyBlink(drawn, 1) : drawn; // collapse the winking eye to a lid
        const e = eyePath(sideShape, EYES[i]!.x, EYES[i]!.y, side);
        el.setAttribute('d', e.d);
        if (e.transform) el.setAttribute('transform', e.transform);
        else el.removeAttribute('transform');
      }

      // Orb parallax keeps the old exponential ease — it is a background effect and does not want
      // the spring's overshoot.
      const t = orbTilt(CENTER, pointerSvg, MAX_TILT_DEG * amp);
      const kt = 1 - Math.pow(1 - TILT_EASE_60, dt / FRAME_60_MS);
      tiltX += (t.rx - tiltX) * kt;
      tiltY += (t.ry - tiltY) * kt;
      svg.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;

      raf = requestAnimationFrame(tickFrame);
    };

    const startLoop = () => {
      if (raf) return;
      last = 0; // don't bill the parked interval as one giant frame
      raf = requestAnimationFrame(tickFrame);
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

  // A held (preview) orb always shows the parametric expression — never the hover/puppy overlay.
  const state = hold ? (blinking ? 'blink' : 'default') : resolveEyeState({ mood, hovered, blinking });
  return (
    <div className={['spark', className].filter(Boolean).join(' ')} style={{ maxWidth: size }} data-state={state} data-behavior={behavior}
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

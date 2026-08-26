import { useCallback, useEffect, useRef, useState } from 'react';
import type { Behavior } from '../components/spark/eyeShape.ts';
import type { Mood } from '../components/spark/eyes.ts';
import { onOrbHover, type OrbIntent } from './ctaHover.ts';

/**
 * The hero Spark orb's behaviour state machine, extracted verbatim from the original `Landing.tsx`
 * so `LandingV2` gets the identical orb — every eye expression, the idle rotation, the tap sequence,
 * the nav/CTA hover reactions, sleep, and cursor-following — WITHOUT editing `Landing.tsx` (the
 * original page keeps its own inline copy). If /v2 is ever promoted, delete Landing's copy and have
 * both import this hook.
 *
 * Returns the derived `hold`/`mood`/`gaze` to spread onto `<Spark>`, the `onOrbTap` click handler
 * for the orb container, and `setHover` for a control (e.g. the hero CTA) to announce a hover intent.
 */

type Showcase = { hold: Behavior } | { mood: Mood };

const SHOWCASE: Showcase[] = [
  { hold: 'happy' },
  { hold: 'wink' },
  { hold: 'curious' },
  { hold: 'surprised' },
  { hold: 'mischief' },
  { mood: 'dizzy' },
  { hold: 'smug' },
];
const CYCLE_MS = 2500;

const INTENT_EXPR: Record<OrbIntent, Showcase> = {
  love: { mood: 'love' },
  skeptical: { hold: 'skeptical' },
  starry: { mood: 'starry' },
};

const TAP_SEQUENCE: Showcase[] = [
  { mood: 'confused' },
  { hold: 'surprised' },
  { hold: 'wide' },
  { hold: 'squint' },
  { hold: 'mischief' },
  { hold: 'angry' },
  { mood: 'dizzy' },
  { mood: 'dead' },
];
const DWELL_MS = 160;
const STILL_MS = 900;
const SLEEP_MS = 150_000;
const TAP_HOLD_MS = 3000;

// Guarded so it is safe in jsdom (no matchMedia) and honours a later system-preference change.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const onChange = () => setReduced(m.matches);
    m.addEventListener?.('change', onChange);
    return () => m.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export interface HeroSpark {
  hold: Behavior | undefined;
  mood: Mood;
  gaze: 'center' | 'cursor';
  onOrbTap: () => void;
  setHover: (next: OrbIntent | null) => void;
}

export function useHeroSpark(): HeroSpark {
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<OrbIntent | null>(null);
  const [motion, setMotion] = useState<'moving' | 'still' | 'asleep'>('still');
  const [tap, setTap] = useState<Showcase | null>(null);
  const tapIndexRef = useRef(0);
  const stillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = usePrefersReducedMotion();

  const armIdle = useCallback((withStill: boolean) => {
    if (stillTimerRef.current) clearTimeout(stillTimerRef.current);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    stillTimerRef.current = withStill ? setTimeout(() => setMotion('still'), STILL_MS) : null;
    sleepTimerRef.current = setTimeout(() => setMotion('asleep'), SLEEP_MS);
  }, []);

  const onOrbTap = useCallback(() => {
    tapIndexRef.current = tapIndexRef.current >= TAP_SEQUENCE.length ? 1 : tapIndexRef.current + 1;
    setTap(TAP_SEQUENCE[tapIndexRef.current - 1]!);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { setTap(null); setMotion('moving'); armIdle(false); }, TAP_HOLD_MS);
  }, [armIdle]);

  useEffect(() => {
    const onMove = () => {
      setMotion('moving');
      setTap(null);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      armIdle(true);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    armIdle(true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (stillTimerRef.current) clearTimeout(stillTimerRef.current);
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, [armIdle]);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % SHOWCASE.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  const setHover = useCallback((next: OrbIntent | null) => {
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    if (next === null) { setIntent(null); return; }
    dwellRef.current = setTimeout(() => setIntent(next), DWELL_MS);
  }, []);
  useEffect(() => () => { if (dwellRef.current !== null) clearTimeout(dwellRef.current); }, []);

  // Nav (logo, tabs, Sign up) lives outside the page tree and announces hover intent via the channel.
  useEffect(() => onOrbHover(setHover), [setHover]);

  const shown: Showcase = intent
    ? INTENT_EXPR[intent]
    : tap
    ? tap
    : motion === 'asleep' ? { hold: 'sleeping' }
    : motion === 'still' || reduced ? { hold: 'focused' }
    : SHOWCASE[step]!;
  const hold = 'hold' in shown ? shown.hold : undefined;
  const mood: Mood = 'mood' in shown ? shown.mood : 'default';
  const gaze: 'center' | 'cursor' = !tap && (intent || motion === 'moving') ? 'cursor' : 'center';

  return { hold, mood, gaze, onOrbTap, setHover };
}

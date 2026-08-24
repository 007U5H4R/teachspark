import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import type { Behavior } from '../components/spark/eyeShape.ts';
import type { Mood } from '../components/spark/eyes.ts';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { saveSource } from '../lib/session.ts';
import { onOrbHover, type OrbIntent } from '../lib/ctaHover.ts';

const VIEWED = 'ts_lv';

type Showcase = { hold: Behavior } | { mood: Mood };

// Idle rotation the hero performs when the pointer is not over a reactive element. Deliberately
// excludes skeptical / love / starry (those are the hover reactions for tabs / CTA / logo) and the
// negative faces (error, sad, dead, sleeping) that would be off-brand on the hero.
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

// What each hover intent shows on the orb.
const INTENT_EXPR: Record<OrbIntent, Showcase> = {
  love: { mood: 'love' },            // Sign up / Get started
  skeptical: { hold: 'skeptical' },  // nav tabs
  starry: { mood: 'starry' },        // TeachSpark logo
};
const DWELL_MS = 160;        // small debounce so a glancing pass over a control doesn't trigger a reaction
const STILL_MS = 900;        // no pointer movement for this long => the orb settles and looks at you
const SLEEP_MS = 150_000;    // 2.5 minutes of stillness => the orb dozes off

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

export function Landing() {
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<OrbIntent | null>(null);
  const [motion, setMotion] = useState<'moving' | 'still' | 'asleep'>('still');
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = usePrefersReducedMotion();

  // Cursor-motion state drives the idle orb: while the pointer moves it performs the rotation; once
  // it goes still it looks straight at you (focused); after 2.5 minutes of stillness it dozes off.
  useEffect(() => {
    let stillTimer: ReturnType<typeof setTimeout>;
    let sleepTimer: ReturnType<typeof setTimeout>;
    const onMove = () => {
      setMotion('moving');
      clearTimeout(stillTimer);
      clearTimeout(sleepTimer);
      stillTimer = setTimeout(() => setMotion('still'), STILL_MS);
      sleepTimer = setTimeout(() => setMotion('asleep'), SLEEP_MS);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    // No movement yet on load: begin the still countdown so it settles/sleeps even if untouched.
    stillTimer = setTimeout(() => setMotion('still'), STILL_MS);
    sleepTimer = setTimeout(() => setMotion('asleep'), SLEEP_MS);
    return () => { window.removeEventListener('pointermove', onMove); clearTimeout(stillTimer); clearTimeout(sleepTimer); };
  }, []);

  // When the pointer isn't over a reactive control the orb rotates through the idle expressions,
  // advancing on a gentle timer. Under reduced-motion it holds the first (happy) expression.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % SHOWCASE.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // Hovering a control (nav tab / logo / CTA) makes the orb react and pauses the rotation until the
  // pointer leaves. A small dwell debounces glancing passes; null clears immediately.
  const setHover = useCallback((next: OrbIntent | null) => {
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    if (next === null) { setIntent(null); return; }
    dwellRef.current = setTimeout(() => setIntent(next), DWELL_MS);
  }, []);
  useEffect(() => () => { if (dwellRef.current !== null) clearTimeout(dwellRef.current); }, []);

  // The nav (logo, tabs, Sign up) is rendered by App, outside this tree, so it announces its hover
  // intent through the channel. The hero's own "Get started" reports directly (below).
  useEffect(() => onOrbHover(setHover), [setHover]);

  // Priority: a hovered control > asleep > still (looks at you) > the moving rotation.
  const shown: Showcase = intent
    ? INTENT_EXPR[intent]
    : motion === 'asleep' ? { hold: 'sleeping' }
    : motion === 'still' || reduced ? { hold: 'focused' } // reduced-motion holds focused, never cycling
    : SHOWCASE[step]!;
  const heroHold = 'hold' in shown ? shown.hold : undefined;
  const heroMood: Mood = 'mood' in shown ? shown.mood : 'default';
  // Track the cursor while reacting or performing; look straight ahead (at the user) when settled/asleep.
  const heroGaze: 'center' | 'cursor' = intent || motion === 'moving' ? 'cursor' : 'center';

  useEffect(() => {
    const src = params.get('src');
    if (src) saveSource(src);
    try {
      if (sessionStorage.getItem(VIEWED)) return;
      sessionStorage.setItem(VIEWED, '1');
    } catch {
      return; // storage blocked: skip the event rather than emit an uncapped one on every mount
    }
    trackEvent('landing_view');
  }, [params]);

  return (
    <main>
      {/* Flat children: the grid-template-areas in global.css place these, and the DOM order is
          the reading order — headline first on every breakpoint. */}
      <section className="hero">
        <h1 className="hero__title"><strong>Ready-to-use</strong><span>Worksheets on WhatsApp</span></h1>
        <p className="hero__eyebrow">A WhatsApp bot that writes a ready-to-use worksheet for your own class in about 2 minutes. Free pilot for teachers.</p>
        <div className="hero__actions" onPointerEnter={() => setHover('love')} onPointerLeave={() => setHover(null)}>
          <NeonButton to="/join" size="lg" onClick={() => trackEvent('cta_tapped', { where: 'hero' })}>Get started →</NeonButton>
        </div>
        <div className="hero__orb"><Spark hold={heroHold} mood={heroMood} holdGaze={heroGaze} /></div>
      </section>

      <section className="section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <p className="section__lead">Three steps, all inside WhatsApp. Nothing to install and no account to make.</p>
        <div className="cards">
          <article className="card"><span className="card__num">1</span><h3>Tell it your class</h3><p>Tap your grade, subject and board from a short menu, then type your topic. No login, no app — just WhatsApp.</p></article>
          <article className="card"><span className="card__num">2</span><h3>Get a 3-level worksheet</h3><p>Support / On-level / Challenge, with an answer key — as a WhatsApp message and a PDF, in about two minutes.</p></article>
          <article className="card"><span className="card__num">3</span><h3>Keep the prompt</h3><p>It sends you the exact prompt, so you can do the same thing yourself in ChatGPT or Gemini next time.</p></article>
        </div>
      </section>

      <section className="section" aria-labelledby="why">
        <h2 id="why">Why teachers use it</h2>
        <p className="section__lead">Built around what actually happens the night before a lesson.</p>
        <div className="cards">
          <article className="card"><h3>Question papers from photos</h3><p>Type <strong>PAPER</strong>, send photos of a textbook chapter, and get a complete question paper back as an editable Word file — answer key included.</p></article>
          <article className="card"><h3>Built for your board</h3><p>CBSE, ICSE or state board, in the language you teach in. Differentiated for the class you actually have.</p></article>
          <article className="card"><h3>Private by design</h3><p>It never asks for student data — please don't send any — and you can leave anytime. No student data, ever.</p></article>
        </div>
        <div className="section__cta" onPointerEnter={() => setHover('love')} onPointerLeave={() => setHover(null)}>
          <NeonButton to="/join" size="lg" onClick={() => trackEvent('cta_tapped', { where: 'why' })}>Join the pilot</NeonButton>
        </div>
      </section>
    </main>
  );
}

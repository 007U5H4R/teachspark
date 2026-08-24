import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import type { Behavior } from '../components/spark/eyeShape.ts';
import type { Mood } from '../components/spark/eyes.ts';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { saveSource } from '../lib/session.ts';
import { onCtaHover } from '../lib/ctaHover.ts';

const VIEWED = 'ts_lv';

// The hero orb performs this curated rotation — warm emotion shapes and symbol overlays. It leaves
// out the negative/reaction faces (error, sad, dead, sleeping): off-brand flashing on a hero for teachers.
type Showcase = { hold: Behavior } | { mood: Mood };
const SHOWCASE: Showcase[] = [
  { hold: 'happy' },
  { hold: 'wink' },
  { mood: 'love' },
  { hold: 'curious' },
  { mood: 'starry' },
  { hold: 'surprised' },
  { hold: 'mischief' },
  { mood: 'dizzy' },
  { hold: 'skeptical' },
  { hold: 'smug' },
];
const CYCLE_MS = 2200;

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
  const [hovering, setHovering] = useState(false);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = usePrefersReducedMotion();

  // The orb performs one expression at a time, advancing on a gentle timer. Under reduced-motion it
  // holds the first (happy) expression instead of cycling.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % SHOWCASE.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // "What's that?" — a genuine dwell on a CTA makes the orb look curious and pauses the rotation
  // until the pointer leaves. The dwell timer is cleared on leave and on unmount.
  const onCtaEnter = () => { dwellRef.current = setTimeout(() => setHovering(true), 420); };
  const onCtaLeave = () => {
    if (dwellRef.current !== null) clearTimeout(dwellRef.current);
    setHovering(false);
  };
  useEffect(() => () => { if (dwellRef.current !== null) clearTimeout(dwellRef.current); }, []);

  // The nav's Sign up button is rendered by App, outside this tree, so it announces its hover
  // rather than calling in. Both CTAs land on the same handlers — one behaviour, one code path.
  useEffect(() => onCtaHover((h) => (h ? onCtaEnter() : onCtaLeave())), []);

  // Curious while a CTA is hovered; otherwise whatever the rotation is currently on.
  const shown: Showcase = hovering ? { hold: 'curious' } : SHOWCASE[step]!;
  const heroHold = 'hold' in shown ? shown.hold : undefined;
  const heroMood: Mood = 'mood' in shown ? shown.mood : 'default';

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
        <div className="hero__actions" onPointerEnter={onCtaEnter} onPointerLeave={onCtaLeave}>
          <NeonButton to="/join" size="lg" onClick={() => trackEvent('cta_tapped', { where: 'hero' })}>Get started →</NeonButton>
        </div>
        <div className="hero__orb"><Spark hold={heroHold} mood={heroMood} holdGaze="cursor" /></div>
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
        <div className="section__cta" onPointerEnter={onCtaEnter} onPointerLeave={onCtaLeave}>
          <NeonButton to="/join" size="lg" onClick={() => trackEvent('cta_tapped', { where: 'why' })}>Join the pilot</NeonButton>
        </div>
      </section>
    </main>
  );
}

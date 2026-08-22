import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Spark, type SparkHandle } from '../components/spark/Spark.tsx';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { saveSource } from '../lib/session.ts';
import { onCtaHover } from '../lib/ctaHover.ts';

const VIEWED = 'ts_lv';

export function Landing() {
  const [params] = useSearchParams();
  const [ctaHover, setCtaHover] = useState(false);
  const sparkRef = useRef<SparkHandle>(null);
  const curiousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "What's that?" — fires only on a genuine dwell, not on every pass of the cursor, and the
  // timer is cleared on leave and on unmount so a glancing hover never fires it late.
  const onCtaEnter = () => {
    setCtaHover(true);
    curiousTimerRef.current = setTimeout(() => sparkRef.current?.signal('curious'), 420);
  };
  const onCtaLeave = () => {
    setCtaHover(false);
    if (curiousTimerRef.current !== null) clearTimeout(curiousTimerRef.current);
  };
  useEffect(() => () => { if (curiousTimerRef.current !== null) clearTimeout(curiousTimerRef.current); }, []);

  // The nav's Sign up button is rendered by App, outside this tree, so it announces its hover
  // rather than calling in. Both CTAs land on the same handlers — one behaviour, one code path.
  useEffect(() => onCtaHover((hovering) => (hovering ? onCtaEnter() : onCtaLeave())), []);

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
          <NeonButton to="/join" size="lg">Get started →</NeonButton>
        </div>
        <div className="hero__orb"><Spark ref={sparkRef} mood={ctaHover ? 'starry' : 'default'} /></div>
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
          <NeonButton to="/join" size="lg">Join the pilot</NeonButton>
        </div>
      </section>
    </main>
  );
}

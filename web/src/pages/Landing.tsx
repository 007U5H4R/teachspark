import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { saveSource } from '../lib/session.ts';

const VIEWED = 'ts_lv';

export function Landing() {
  const [params] = useSearchParams();
  const [ctaHover, setCtaHover] = useState(false);

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
      <section className="hero">
        <div>
          <p className="hero__eyebrow">A WhatsApp bot that writes a ready-to-use worksheet for your own class in about 2 minutes. Free pilot for teachers.</p>
          <div className="hero__actions" onPointerEnter={() => setCtaHover(true)} onPointerLeave={() => setCtaHover(false)}>
            <NeonButton to="/join" size="lg">Get started →</NeonButton>
          </div>
          <h1 className="hero__title"><strong>Ready-to-use</strong><span>Worksheets on WhatsApp</span></h1>
        </div>
        <div className="hero__orb"><Spark mood={ctaHover ? 'starry' : 'default'} /></div>
      </section>

      <section className="section" aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <div className="cards">
          <article className="card"><span className="card__num">1</span><h3>Tell it your class</h3><p>Tap your grade, subject and board from a short menu, then type your topic. No login, no app — just WhatsApp.</p></article>
          <article className="card"><span className="card__num">2</span><h3>Get a 3-level worksheet</h3><p>Support / On-level / Challenge, with an answer key — as a WhatsApp message and a PDF, in about two minutes.</p></article>
          <article className="card"><span className="card__num">3</span><h3>Keep the prompt</h3><p>It sends you the exact prompt, so you can do the same thing yourself in ChatGPT or Gemini next time.</p></article>
        </div>
      </section>

      <section className="section" aria-labelledby="why">
        <h2 id="why">Why teachers use it</h2>
        <div className="cards">
          <article className="card"><h3>Question papers from photos</h3><p>Type <strong>PAPER</strong>, send photos of a textbook chapter, and get a complete question paper back as an editable Word file — answer key included.</p></article>
          <article className="card"><h3>Built for your board</h3><p>CBSE, ICSE or state board, in the language you teach in. Differentiated for the class you actually have.</p></article>
          <article className="card"><h3>Private by design</h3><p>It never asks for student data — please don't send any — and you can leave anytime. No student data, ever.</p></article>
        </div>
        <div className="hero__actions" style={{ marginTop: 32 }}>
          <NeonButton to="/join" size="lg">Join the pilot</NeonButton>
        </div>
      </section>
    </main>
  );
}

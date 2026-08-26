import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { PhoneDemo } from '../components/PhoneDemo.tsx';
import { useHeroSpark } from '../lib/useHeroSpark.ts';
import { emitOrbHover } from '../lib/ctaHover.ts';
import { trackEvent } from '../lib/api.ts';
import { saveSource } from '../lib/session.ts';
import './LandingV2.css';

const VIEWED = 'ts_lv'; // shared session-guard key with the original landing (a person sees one variant)

/** A small, static green orb for the brand marks (nav / footer). The one *animated* Spark is the
 *  hero orb — matching the original landing, which has exactly one. */
function V2Orb() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="v2ob" cx="36%" cy="30%" r="82%">
          <stop offset="0%" stopColor="#f2fff9" /><stop offset="18%" stopColor="#bff3d9" />
          <stop offset="44%" stopColor="#57df97" /><stop offset="70%" stopColor="#17954a" /><stop offset="100%" stopColor="#0a5c34" />
        </radialGradient>
        <radialGradient id="v2oh" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".95" /><stop offset="60%" stopColor="#fff" stopOpacity=".25" /><stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="v2oe" cx="40%" cy="27%" r="82%">
          <stop offset="0%" stopColor="#1f5f47" /><stop offset="55%" stopColor="#0a3226" /><stop offset="100%" stopColor="#03150e" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="55" r="45" fill="url(#v2ob)" />
      <circle cx="48" cy="55" r="9.6" fill="url(#v2oe)" /><circle cx="72" cy="55" r="9.6" fill="url(#v2oe)" />
      <circle cx="51" cy="51" r="3.6" fill="#fff" /><circle cx="75" cy="51" r="3.6" fill="#fff" />
      <path d="M46 71 Q60 81 74 71" fill="none" stroke="#06271c" strokeWidth="3.2" strokeLinecap="round" opacity=".5" />
      <ellipse cx="44" cy="34" rx="18" ry="12" fill="url(#v2oh)" transform="rotate(-24 44 34)" />
    </svg>
  );
}

/**
 * "Trusted Teal" alternate landing (route /v2). Self-contained and fully scoped under .landing-v2;
 * reuses the real animated <Spark> (via useHeroSpark) and <PhoneDemo>. The original Landing / tokens
 * are untouched. Built to A/B against the original — see design/landing-redesign/Design.md.
 */
export function LandingV2() {
  const [params] = useSearchParams();
  const { hold, mood, gaze, onOrbTap, setHover } = useHeroSpark();
  const rootRef = useRef<HTMLDivElement>(null);

  // Fire the same funnel events as the original landing (variant tagging is added in the A/B phase).
  useEffect(() => {
    const src = params.get('src');
    if (src) saveSource(src);
    try {
      if (sessionStorage.getItem(VIEWED)) return;
      sessionStorage.setItem(VIEWED, '1');
    } catch {
      return;
    }
    trackEvent('landing_view');
  }, [params]);

  // Scroll reveal: add .is-in as each [data-reveal] enters view. IntersectionObserver, never a scroll
  // listener. Elements are visible by default under reduced-motion via CSS.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }),
      { threshold: 0.18 },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const tagline = ['Less', 'time', 'making', 'worksheets.', 'More', 'time', 'teaching.'];

  return (
    <div className="landing-v2" ref={rootRef}>
      <a href="#v2-main" className="v2-skip" style={{ position: 'absolute', left: -9999, top: 0 }}>Skip to content</a>

      <nav className="v2-nav" aria-label="Main">
        <div className="v2-wrap v2-nav__in">
          <Link to="/v2" className="v2-brand" onPointerEnter={() => emitOrbHover('starry')} onPointerLeave={() => emitOrbHover(null)}>
            <V2Orb />Teach<span className="b">Spark</span>
          </Link>
          <div className="v2-nav__links" onPointerEnter={() => emitOrbHover('skeptical')} onPointerLeave={() => emitOrbHover(null)}>
            <a href="#v2-how">How it works</a>
            <a href="#v2-why">Why teachers use it</a>
            <a href="#v2-faq">FAQ</a>
            <Link className="v2-btn v2-btn--primary v2-nav__cta" to="/join" onClick={() => trackEvent('cta_tapped', { where: 'nav' })}>Join the free pilot</Link>
          </div>
        </div>
      </nav>

      <main id="v2-main">
        {/* HERO */}
        <section className="v2-hero">
          <div className="v2-wrap v2-hero__grid">
            <div>
              <span className="v2-eyebrow">Free pilot · for Indian classrooms</span>
              <h1>Worksheets that fit your class, ready in about 2 minutes.</h1>
              <p className="v2-hero__sub">TeachSpark writes a 3-level worksheet with an answer key for your exact grade, subject and board — right inside WhatsApp. No app, no account, no student data.</p>
              <div className="v2-hero__cta" onPointerEnter={() => setHover('love')} onPointerLeave={() => setHover(null)}>
                <Link className="v2-btn v2-btn--primary v2-btn--lg" to="/join" onClick={() => trackEvent('cta_tapped', { where: 'hero' })}>Get my first worksheet</Link>
                <a className="v2-btn v2-btn--ghost v2-btn--lg" href="#v2-how">See how it works</a>
              </div>
              <p className="v2-hero__proof">🔒 <b>No student data, ever.</b> · CBSE, ICSE &amp; state boards</p>
            </div>
            <div className="v2-hero__orb" onClick={onOrbTap}>
              <Spark hold={hold} mood={mood} holdGaze={gaze} />
            </div>
          </div>
        </section>

        {/* TRUST BAND */}
        <section className="v2-trust" aria-label="Why you can trust it">
          <div className="v2-wrap v2-trust__in">
            <div className="v2-trust__item"><span className="v2-trust__ic">🔒</span><div><div className="v2-trust__t">No student data, ever</div><div className="v2-trust__d">It never asks for a single student detail.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic">📚</span><div><div className="v2-trust__t">Built for your board</div><div className="v2-trust__d">CBSE, ICSE or state — in the language you teach.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic">👩‍🏫</span><div><div className="v2-trust__t">18 teachers on the pilot</div><div className="v2-trust__d">Free, and you can leave anytime.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic">💚</span><div><div className="v2-trust__t">Made for a real teacher</div><div className="v2-trust__d">Built for my mother, a Sanskrit teacher.</div></div></div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="v2-band" id="v2-how">
          <div className="v2-wrap">
            <div className="v2-head" data-reveal><div className="v2-kick">How it works</div><h2>Three steps, all inside WhatsApp.</h2><p>Nothing to install and no account to make. You message TeachSpark the way you'd message a colleague.</p></div>
            <div className="v2-steps" data-reveal>
              <div className="v2-card"><div className="v2-num">1</div><h3>Tell it your class</h3><p>Tap your grade, subject and board from a short menu, then type your topic.</p></div>
              <div className="v2-card"><div className="v2-num">2</div><h3>Get a 3-level worksheet</h3><p>Support, on-level and challenge, with an answer key — as a message and a printable PDF.</p></div>
              <div className="v2-card"><div className="v2-num">3</div><h3>Keep the prompt</h3><p>It sends the exact prompt it used, so you can make the next one yourself in any AI tool.</p></div>
            </div>
          </div>
        </section>

        {/* PROOF STRIP */}
        <section className="v2-band" style={{ paddingTop: 0 }}>
          <div className="v2-wrap">
            <div className="v2-proof" data-reveal>
              <div><div className="n">~2 min</div><div className="l">To a full 3-level worksheet</div></div>
              <div><div className="n">3</div><div className="l">Ability levels + answer key</div></div>
              <div><div className="n">18</div><div className="l">Teachers already using it</div></div>
              <div><div className="n">0</div><div className="l">Student details ever collected</div></div>
            </div>
          </div>
        </section>

        {/* WHY */}
        <section className="v2-band" style={{ background: 'var(--v2-surface)', borderTop: '1px solid var(--v2-border)' }} id="v2-why">
          <div className="v2-wrap">
            <div className="v2-head" data-reveal><div className="v2-kick">Why teachers use it</div><h2>Built for the Indian classroom.</h2></div>
            <div className="v2-split" style={{ marginBottom: 30 }} data-reveal>
              <img className="v2-illo" src="/img/teacher-prep.jpg" width={1000} height={737} loading="lazy" alt="A teacher preparing a question paper at her desk under a warm lamp" />
              <div>
                <div className="v2-card" style={{ marginBottom: 14 }}><h3><span className="v2-ic">📄</span>Question papers from photos</h3><p>Type <b>PAPER</b>, send photos of a textbook chapter, and get a complete question paper as an editable Word file — answer key included.</p></div>
                <div className="v2-card"><h3><span className="v2-ic">🌐</span>Your board, your language</h3><p>CBSE, ICSE or state board, differentiated for the class you actually have — in English, Hindi, Sanskrit and more.</p></div>
              </div>
            </div>
            <div className="v2-why" data-reveal>
              <div className="v2-card"><h3><span className="v2-ic">🔒</span>Private by design</h3><p>It never asks for student data — please don't send any.</p></div>
              <div className="v2-card"><h3><span className="v2-ic">📱</span>No install, no login</h3><p>If you can send a WhatsApp message, you can use it.</p></div>
              <div className="v2-card"><h3><span className="v2-ic">🆓</span>Free while it's a pilot</h3><p>I'm learning from teachers, not selling.</p></div>
            </div>
          </div>
        </section>

        {/* TAGLINE REVEAL */}
        <section className="v2-tagline" data-reveal aria-label="Less time making worksheets. More time teaching.">
          <div className="v2-wrap">
            <h2>
              {tagline.map((w, i) => (
                <span key={i} className={i >= 4 ? 'w em' : 'w'} style={{ transitionDelay: `${i * 70}ms` }}>{w}{i < tagline.length - 1 ? ' ' : ''}</span>
              ))}
            </h2>
          </div>
        </section>

        {/* SEE IT IN ACTION */}
        <section className="v2-band" style={{ paddingTop: 0 }}>
          <div className="v2-wrap v2-split" data-reveal>
            <div>
              <div className="v2-head" style={{ marginBottom: 16 }}><div className="v2-kick">See it in action</div><h2>Watch a worksheet appear.</h2><p>A quick walkthrough — sign up, connect on WhatsApp, and make your first worksheet.</p></div>
              <Link className="v2-btn v2-btn--primary v2-btn--lg" to="/join" onClick={() => trackEvent('cta_tapped', { where: 'why' })}>Try it yourself</Link>
            </div>
            <div className="v2-demo"><PhoneDemo autoPlay /></div>
          </div>
        </section>

        {/* FAQ */}
        <section className="v2-band" id="v2-faq" style={{ background: 'var(--v2-surface)', borderTop: '1px solid var(--v2-border)' }}>
          <div className="v2-wrap">
            <div className="v2-head" style={{ margin: '0 auto 32px', textAlign: 'center' }} data-reveal><div className="v2-kick">Questions teachers ask</div><h2>Straight answers.</h2></div>
            <div className="v2-faq" data-reveal>
              <details open><summary>Is it really free?</summary><p>Yes. It's a small pilot and free while I learn what teachers need. No card, no subscription.</p></details>
              <details><summary>Do I need to install an app or make an account?</summary><p>No. It works inside WhatsApp — you message it like a colleague.</p></details>
              <details><summary>Is my students' data safe?</summary><p>It never asks for student data, and please don't send any. It only needs your grade, subject, board and topic.</p></details>
              <details><summary>Which boards and languages does it support?</summary><p>CBSE, ICSE and state boards, in the language you teach — English, Hindi, Sanskrit and more.</p></details>
              <details><summary>What if I'm not very techy?</summary><p>If you can send a WhatsApp message, you can use it. Everything is a short menu or a simple reply.</p></details>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="v2-final" id="v2-join">
          <div className="v2-wrap" data-reveal style={{ maxWidth: 640, marginInline: 'auto' }}>
            <div className="v2-final__orb"><V2Orb /></div>
            <h2>Make your first worksheet tonight.</h2>
            <p>Two quick details and we'll hand you the WhatsApp link. Takes 15 seconds — no number to type.</p>
            <Link className="v2-btn v2-btn--primary v2-btn--lg" to="/join" onClick={() => trackEvent('cta_tapped', { where: 'why' })}>Join the free pilot →</Link>
            <p className="v2-hero__proof" style={{ justifyContent: 'center', marginTop: 18 }}>🔒 <b>No student data, ever.</b></p>
          </div>
        </section>
      </main>

      <footer className="v2-footer">
        <div className="v2-wrap v2-foot">
          <div>
            <Link to="/v2" className="v2-brand"><V2Orb />Teach<span className="b">Spark</span></Link>
            <p className="v2-foot__blurb">A free pilot for teachers: a WhatsApp bot that writes a ready-to-use worksheet for your own class in about two minutes.</p>
            <p className="v2-foot__promise"><span className="v2-foot__dot" />No student data, ever.</p>
          </div>
          <div className="v2-foot__links">
            <a href="#v2-how">How it works</a><a href="#v2-why">Why teachers use it</a><a href="#v2-faq">FAQ</a><Link to="/join">Join the pilot</Link><Link to="/join">Privacy</Link><Link to="/join">Terms</Link>
          </div>
        </div>
        <div className="v2-wrap"><p className="v2-foot__legal">© 2026 TeachSpark — a small pilot. You can leave anytime.</p></div>
      </footer>
    </div>
  );
}

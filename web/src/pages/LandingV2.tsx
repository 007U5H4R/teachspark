import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { PhoneDemo } from '../components/PhoneDemo.tsx';
import { Wordmark } from '../components/Wordmark.tsx';
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
          <stop offset="0%" stopColor="#d8f2e5" /><stop offset="18%" stopColor="#7ed3a4" />
          <stop offset="44%" stopColor="#2a9a5e" /><stop offset="70%" stopColor="#0f6236" /><stop offset="100%" stopColor="#05331d" />
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

/** One consistent line-icon system (1.7 stroke, currentColor) — replaces emoji so the marks read as
 *  one drawn set, not a platform-dependent grab-bag. Lucide-style geometry. */
function Ic({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}
const IconShield = ({ size }: { size?: number }) => <Ic size={size}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></Ic>;
const IconBook = () => <Ic><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Ic>;
const IconUsers = () => <Ic><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Ic>;
const IconHeart = () => <Ic><path d="M20.8 5.1a5 5 0 0 0-7.1 0L12 6.8l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.8a5 5 0 0 0 0-7.1z" /></Ic>;
const IconFile = () => <Ic><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></Ic>;
const IconGlobe = () => <Ic><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" /></Ic>;
const IconChat = () => <Ic><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></Ic>;
const IconGift = () => <Ic><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></Ic>;

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
            <Wordmark />
          </Link>
          <div className="v2-nav__right">
            <div className="v2-nav__links" onPointerEnter={() => emitOrbHover('skeptical')} onPointerLeave={() => emitOrbHover(null)}>
              <a href="#v2-how">How it works</a>
              <a href="#v2-why">Why teachers use it</a>
              <a href="#v2-faq">FAQ</a>
            </div>
            <Link className="v2-btn v2-btn--primary v2-nav__cta" to="/join" onPointerEnter={() => emitOrbHover('love')} onPointerLeave={() => emitOrbHover(null)} onClick={() => trackEvent('cta_tapped', { where: 'nav' })}>Join the free pilot</Link>
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
              <p className="v2-hero__sub">A ready-to-use, 3-level worksheet for your exact grade, subject and board — right inside WhatsApp.</p>
              <div className="v2-hero__cta" onPointerEnter={() => setHover('love')} onPointerLeave={() => setHover(null)}>
                <Link className="v2-btn v2-btn--primary v2-btn--lg" to="/join" onClick={() => trackEvent('cta_tapped', { where: 'hero' })}>Get my first worksheet</Link>
                <a className="v2-btn v2-btn--ghost v2-btn--lg" href="#v2-how">See how it works</a>
              </div>
              <p className="v2-hero__proof"><span className="v2-proof-ic"><IconShield size={16} /></span><b>No student data, ever.</b> · CBSE, ICSE &amp; state boards</p>
            </div>
            <div className="v2-hero__orb" onClick={onOrbTap}>
              <Spark hold={hold} mood={mood} holdGaze={gaze} />
            </div>
          </div>
        </section>

        {/* TRUST BAND */}
        <section className="v2-trust" aria-label="Why you can trust it">
          <div className="v2-wrap v2-trust__in">
            <div className="v2-trust__item"><span className="v2-trust__ic"><IconShield /></span><div><div className="v2-trust__t">No student data, ever</div><div className="v2-trust__d">It never asks for a single student detail.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic"><IconBook /></span><div><div className="v2-trust__t">Built for your board</div><div className="v2-trust__d">CBSE, ICSE or state — in the language you teach.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic"><IconUsers /></span><div><div className="v2-trust__t">18 teachers on the pilot</div><div className="v2-trust__d">Free, and you can leave anytime.</div></div></div>
            <div className="v2-trust__item"><span className="v2-trust__ic"><IconHeart /></span><div><div className="v2-trust__t">Made for a real teacher</div><div className="v2-trust__d">Built for my mother, a Sanskrit teacher.</div></div></div>
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
                <div className="v2-card" style={{ marginBottom: 14 }}><h3><span className="v2-ic"><IconFile /></span>Question papers from photos</h3><p>Type <b>PAPER</b>, send photos of a textbook chapter, and get a complete question paper as an editable Word file — answer key included.</p></div>
                <div className="v2-card"><h3><span className="v2-ic"><IconGlobe /></span>Your board, your language</h3><p>CBSE, ICSE or state board, differentiated for the class you actually have — in English, Hindi, Sanskrit and more.</p></div>
              </div>
            </div>
            <div className="v2-why" data-reveal>
              <div className="v2-card"><h3><span className="v2-ic"><IconShield /></span>Private by design</h3><p>It never asks for student data — please don't send any.</p></div>
              <div className="v2-card"><h3><span className="v2-ic"><IconChat /></span>No install, no login</h3><p>If you can send a WhatsApp message, you can use it.</p></div>
              <div className="v2-card"><h3><span className="v2-ic"><IconGift /></span>Free while it's a pilot</h3><p>I'm learning from teachers, not selling.</p></div>
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
            <p className="v2-hero__proof" style={{ justifyContent: 'center', marginTop: 18 }}><span className="v2-proof-ic"><IconShield size={16} /></span><b>No student data, ever.</b></p>
          </div>
        </section>
      </main>

      <footer className="v2-footer">
        <div className="v2-wrap v2-foot">
          <div>
            <Link to="/v2" className="v2-brand"><Wordmark /></Link>
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

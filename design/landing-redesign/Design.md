# Design Specification (`Design.md`)
### TeachSpark landing — Option B "Trusted Teal" alternate (`/v2`)

> Scope: a **separate, additive** teacher-facing landing at a new route. The original `/` (`Landing.tsx`, `tokens.css`, `global.css`, `Spark.tsx`) stays byte-for-byte intact. Built to A/B against the original. Grounded in the approved mockup `option-b.html`.

---

## 1. Executive Visual Strategy & Discovery

- **Benchmark Patterns (Mobbin, web):**
  - [Uxcel](https://mobbin.com/screens/4a8fb9b4-587c-4e49-a84e-96c27086c297) — "The new standard in product team education": a **certification pill above the headline**, tight headline + subhead, dual CTA, and a **logo trust-bar** directly under the fold, then a product screenshot. This is the trustworthy-education skeleton we mirror (pill → headline → CTA → proof strip → demo).
  - [SchoolAI](https://mobbin.com/screens/2f316cb2-3af1-46c5-b1ac-3bacdae1999b) — "AII that connects teachers with every student": explicitly **teacher-audience** framing with a **row of trust/compliance badges** beneath the CTA. Validates leading with the teacher and putting proof immediately under the promise.
  - [Brilliant](https://mobbin.com/screens/f8ff59f5-d476-48ce-9082-06c843aaa39c) — big confident type + a segmented "learner / teacher" choice and a category strip; and [Babbel](https://mobbin.com/screens/f5354af0-9ef9-4275-93fa-ee0bddc48865) — a single high-contrast social-proof bar ("Over 25 million…"). Both back our **proof strip** ("~2 min · 3 levels · 18 teachers · 0 student details").
- **Generative Media Assets (Higgsfield · Recraft V4.1, paint-stroke, on-palette, white bg):**
  - `assets/teacher-prep.png` (1216×896) — an Indian teacher in a green sari preparing a question paper under a warm lamp. Use in the **"Why teachers use it"** split (left) and/or a founder/prep moment.
  - `assets/teacher-class.png` (1216×896) — an Indian teacher gesturing to attentive students at a teal board. Use in **"See it in action"** or a secondary section.
  - Both were generated with the brand palette (`#0E7C86 #0A575F #1E6B45 #C08A2E #E3F1F2`) so they sit natively on Option B's white/teal. Regenerate variants with the same palette + prompt spine if more are needed.
- **Core Aesthetic:** calm, credible, "a school would endorse this." Flat light surfaces, crisp Inter, one saturated **teal** action color, generous whitespace, hairline borders, a 3px accent rule on cards. No neon, no dark canvas, no background gradients (gradients appear only inside the Spark SVG and, optionally, on the hero-heading text per the light-theme rule). The green **Spark orb is the one warm, characterful anchor** against the cool palette.
- **Conversion Goal:** one offer (free worksheet), one audience (the time-poor Indian K–12 teacher), one primary action (**Join the free pilot** → the existing `/join` flow). Every section drives that single CTA; proof sits beside each claim.
- **PWA & Mobile Considerations:** all tap targets ≥ 44px; sticky nav collapses to a hamburger < 768px (mirror the existing pattern); safe-area padding on the sticky nav and final CTA; the existing service worker / precache is unaffected (this is a new route, same shell). No layout shift from the orb (fixed aspect box).

---

## 2. Design Tokens & Brand System

Scoped under a `.landing-v2` wrapper — **does not touch `tokens.css`**. Values below are the Option B palette expressed as an OKLCH ramp (approx.; hex in parentheses is the source of truth in the mockup).

- **Color scale (OKLCH):**
  - Surface: `--v2-bg` oklch(1 0 0) (`#FFFFFF`) · `--v2-surface` oklch(0.978 0.004 210) (`#F6F9FA`) · `--v2-surface-2` oklch(0.965 0.006 205) (`#EEF4F5`)
  - Ink/text: `--v2-ink` oklch(0.24 0.02 210) (`#0F1E22`) · `--v2-muted` oklch(0.47 0.02 216) (`#51636A`) · `--v2-muted-dim` oklch(0.60 0.015 216) (`#78888E`)
  - Accent (teal): `--v2-accent` oklch(0.56 0.086 205) (`#0E7C86`) · `--v2-accent-strong` oklch(0.43 0.068 205) (`#0A575F`) · `--v2-accent-tint` oklch(0.95 0.021 200) (`#E3F1F2`) · `--v2-accent-line` oklch(0.90 0.03 200) (`#C6E3E6`)
  - Spark-harmony green (secondary): `--v2-green` oklch(0.50 0.11 156) (`#1E6B45`) · Gold (sparkle/warm): `--v2-gold` oklch(0.60 0.11 76) (`#B8791A`)
  - Lines/state: `--v2-border` oklch(0.93 0.005 210) (`#E4EAEC`) · `--v2-border-strong` oklch(0.87 0.008 210) (`#CFDADD`) · `--v2-danger` reuse `#ff6b6b`
  - Contrast: ink-on-white ≥ 13:1; accent-on-white ≥ 4.6:1; **white text on `--v2-accent` ≥ 4.5:1** (verify — see QA note on the nav CTA); muted-on-white ≥ 4.5:1.
- **Typography:** **Inter** 400/500/600/700/800 for headings *and* body (institutional, one crisp face). **Baloo 2** 800 for the wordmark only. (Deliberate deviation from the landing-page-design "no Inter" rule — brand fidelity with the real app, which ships Inter, wins.) No italics, cap weight at 800.
  - Scale (clamp, from mockup): h1 `clamp(2.2rem,5vw,3.5rem)` / lh 1.1 / ls −0.025em · h2 `clamp(1.7rem,3.4vw,2.4rem)` · h3 1.1–1.16rem · body 1rem–1.2rem / lh 1.55. Headings `text-wrap:balance`, body `text-wrap:pretty`.
- **Spacing & radius:** 4px base (reuse the app's `--sp-*` semantics). Radius set is intentionally **crisper** than the original: `--v2-radius` 14 · `--v2-radius-lg` 18 · `--v2-radius-sm` 10 · pill 999. Main button padding 14px/26px (lg), 12px/20px (md).

---

## 3. Component Architecture & Spatial Layout

Section order (mirrors the approved IA; new route only):
1. **Sticky nav** — Wordmark (Spark + Teach·Spark) · pills (How it works / Why teachers use it / FAQ) · primary CTA "Join the free pilot". Hamburger < 768px.
2. **Hero** — 1.12fr / 0.88fr split. Left: eyebrow pill ("Free pilot · for Indian classrooms") → h1 (≤ 15ch, meaningful line breaks, light-theme heading may use the `#0F1E22 → #4A5A62` L-to-R text gradient) → subhead (≤ 46ch) → dual CTA (solid teal primary + ghost) → proof line ("No student data, ever · CBSE, ICSE & state boards"). Right: **the real animated Spark** in a fixed aspect box with a soft teal radial tint behind it.
3. **Trust band** — 4-up grid (icon + title + one line): No student data ever · Built for your board · 18 teachers on the pilot · Made for a real teacher. Collapses 4→2→1.
4. **How it works** — 3 cards (numbered, 3px teal accent rule), then the **proof strip** (`~2 min · 3 · 18 · 0`) on `--v2-accent-strong`.
5. **Why teachers use it** — split: **`teacher-prep.png`** left, two claim cards right (Papers from photos · Your board & language) → 3 benefit cards (Private by design · No install · Free pilot).
6. **See it in action** — split: copy + CTA / the real `PhoneDemo` (reused unedited). Optionally **`teacher-class.png`** as an adjacent accent.
7. **Tagline reveal (mandatory)** — "Less time making worksheets. **More time teaching.**" as its own moment; words activate one at a time on scroll (see §4).
8. **FAQ** — 5 `<details>` (is it free / no app / data safe / boards & languages / not techy).
9. **Final CTA** — Spark + "Make your first worksheet tonight." + primary CTA (→ `/join`) + privacy reassurance.
10. **Footer** — Wordmark, blurb, "No student data, ever." promise, mirrored links + Privacy/Terms.

- **The Spark orb (KEEP — real component, full behavior):** reuse `web/src/components/spark/Spark.tsx` **unedited**. Reproduce the original hero behavior by extracting the `Landing.tsx` orb state machine into a **new** `web/src/lib/useHeroSpark.ts` hook (a copy, so `Landing.tsx` stays untouched) that `LandingV2` consumes: idle expression rotation (happy/wink/curious/surprised/mischief/dizzy/smug on a 2.5s cycle), **cursor-following gaze** while moving, settle-to-`focused` after 900ms still, `sleeping` after 150s, the 8-step **tap sequence** (confused→…→dead), and hover reactions (love on CTAs, skeptical on nav pills, starry on the logo) via the existing `ctaHover.ts` channel. Reduced-motion holds `focused`. On the light bg, soften the orb's dark-tuned halo with a **scoped wrapper** (`.landing-v2 .hero__orb { filter: … }`) — never edit `Spark.tsx`.
- **UI components (states — Emil-style):** every interactive element ships hover (bg/scale), active (`translateY(1px)`/`scale(.98)`), and a visible focus ring (`box-shadow` at 2px `--v2-accent`). Cards lift `translateY(-3px)` + shadow on hover. No dead links; current nav item indicated.
- **Perceptual weighting:** Gestalt **common-region** for the trust band and cards (shared container/hairline border groups them); **proximity** clusters each icon+title+line; **similarity** — one teal action color means "only teal is clickable-primary"; **figure-ground** — the saturated Spark + teal CTAs are the figures against the calm white ground; **Fitts** — the primary CTA is the largest, highest-contrast target, repeated at hero and footer; **visual hierarchy** — size/weight/color descend headline → subhead → proof → body.

---

## 4. Motion & Micro-Interactions Spec

- **Easing:** all transitions use `cubic-bezier(.32,.72,0,1)` (heavy, fluid). Durations: micro 200ms, section reveal 800ms.
- **Section reveal:** on enter-viewport, `translateY(16px)`→0 with fade (and optional `blur(6px)`→0) via **IntersectionObserver** (never a scroll listener). Respect `prefers-reduced-motion` (no transform, instant).
- **Spark physics:** unchanged from the original component (its rAF loop, blink cadence, gaze spring). The only new motion is the scoped halo softening (static filter).
- **Tagline reveal:** words start at ~30% ink opacity and transition to full color one at a time as the section crosses a trigger line, per-word IntersectionObserver, using the easing above. Reduced-motion → all words full-color immediately.
- **Buttons/cards:** hover 200ms bg + `translateY(-1px/-3px)`; active settles to 0. Touch feedback: `:active` scale on mobile.

---

## 5. Accessibility & QA Checklist

- **Contrast:** re-verify **white text on `--v2-accent` (`#0E7C86`)** — in the mockup the nav CTA read faint; if < 4.5:1 at 15px, darken to `--v2-accent-strong` or add weight. Body/muted/ink all pass on white.
- **Keyboard/focus:** visible focus ring on every link, button, `summary`, and the orb container; skip-to-content link; logical tab order; FAQ `<details>` are natively keyboard-operable.
- **Reduced motion:** section reveals, tagline word-reveal, and the Spark idle animation all fall back to static (`focused` hold) under `prefers-reduced-motion`.
- **Semantics/SEO:** `<nav>/<main>/<section>/<footer>`, one `<h1>`, alt text on both illustrations (e.g. "A teacher preparing a question paper at her desk"), real `<title>` + meta description + **existing OG/Twitter tags carry over unchanged** (do not regress the link preview).
- **Responsive:** verify no horizontal scroll and usable nav at ~375 / 768 / desktop; trust band 4→2→1; hero collapses orb-above-text < 900px.
- **A/B integrity (Phase 3):** the splitter must assign variant **before** first paint (no flash of the wrong variant), persist per `visitor_id`, and stamp `variant: 'A'|'B'` on `landing_view`, `cta_tapped`, `signup_view`, `signup_submitted`, `join_tapped` (Mixpanel super-property + `/api/events` field) so the landing funnel can be compared A vs B in Mixpanel and/or a new `/admin` variant split.
- **Isolation:** confirm the only shared-file edit is the additive `<Route path="/v2">` in `App.tsx` (Phase 2) and the additive `variant` field + splitter (Phase 3). Original `/` renders identically before and after.

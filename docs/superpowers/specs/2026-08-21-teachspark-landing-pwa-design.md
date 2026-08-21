# TeachSpark Landing PWA — Design Spec

**Date:** 2026-08-21
**Status:** Approved (design) — pending spec review before implementation plan
**Author:** Tushar + Claude (brainstorming)

## Problem & Why It Matters

TeachSpark recruits teachers into a WhatsApp bot, but the entire funnel *before*
the WhatsApp join is invisible. The bot's `events` table only starts recording at
`session_started` — after someone has already tapped a `wa.me` link and joined the
Twilio sandbox. We can't see who saw the pitch, who was interested enough to give
their details, or who dropped off at the join tap (the single biggest drop-off,
per `docs/pilot/pitch.md`).

A branded landing PWA fixes this: it becomes the measurable **top of the funnel**,
captures teacher demographics at sign-up, hands off cleanly to WhatsApp, and gives
the admin an analytics view that stitches the pre-join funnel to the existing bot
funnel.

## Target Users

- **Teachers (public / no login):** land on the page, are delighted by the mascot,
  read what TeachSpark does, submit a short form, and tap through to WhatsApp.
- **Admin (password-gated):** the pilot owner, viewing analytics — funnel, lead vs
  lag metrics, and demographics.

## Key Constraint (shapes the whole design)

In the **Twilio WhatsApp sandbox, the server cannot send a message to a number that
has not joined yet** (error 63015). The join is what grants send permission. So the
page does **not** text the join link to the teacher. Instead it presents a `wa.me`
deep-link button the teacher taps, which opens WhatsApp with `join captain-cheese`
pre-filled — exactly the mechanism `docs/pilot/pitch.md` already relies on.

## Scope

### In scope
- Landing page with interactive mascot ("Spark", a green orb whose eyes track the
  cursor and change expression).
- Sign-up form capturing Name, Profession, Organization/School, WhatsApp Number,
  City, Country.
- Success/hand-off screen with a `wa.me` tap-to-join button + the 3 join steps.
- Two "profiles": **user** = public flow (no login); **admin** = password-gated
  analytics dashboard.
- Admin dashboard: full funnel + lead/lag metric cards + demographic breakdowns.
- PWA (installable manifest + service worker), Open Graph link preview, mobile
  responsive — all mandatory gates.
- Two new DB tables (`signups`, `web_events`) + phone-based reconciliation to the
  existing `teachers` table.

### Out of scope
- Teacher accounts / login / per-teacher dashboard.
- Server-sent SMS or WhatsApp messages to un-joined numbers.
- Date-range picker and CSV export in the dashboard (raw export already exists via
  `npm run export:events`).
- Orb extras beyond the 5 eye states: no mouth/speech/sound/drag physics.

## Architecture (Approach A — chosen)

A small **Vite + React** app compiled to a static build, **served by the existing
Express app** on the same Railway deploy. Express gains a few JSON routes; the
frontend is static assets. One deploy, one domain, shared Supabase DB, direct reuse
of `computeFunnel()`.

- Rejected **B (separate Vercel frontend)**: two deploys, CORS, duplicated secrets —
  overkill for a pilot.
- Rejected **C (vanilla server-rendered HTML)**: the animated orb and interactive
  dashboard become painful to maintain without a component model.

Charts are **hand-rolled SVG** (funnel bars, demographic bars) — no heavy chart
library, keeping the PWA bundle small.

## Data Model

Two new tables alongside the existing schema. Existing `teachers`, `events`,
`generations` tables are unchanged.

```sql
create table public.signups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  profession     text not null,
  organization   text,
  phone_e164     text not null,   -- normalized (E.164)
  phone_raw      text not null,   -- as typed
  city           text,
  country        text,
  source         text,            -- optional utm/source
  join_tapped_at timestamptz,     -- when the wa.me button was tapped
  teacher_id     uuid references public.teachers(id), -- filled on reconciliation
  matched_at     timestamptz,
  created_at     timestamptz not null default now()
);

create table public.web_events (
  id         uuid primary key default gen_random_uuid(),
  visitor_id text,                -- anonymous id from localStorage
  name       text not null,       -- landing_view | signup_submitted | join_tapped
  signup_id  uuid references public.signups(id),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signups_phone_idx on public.signups (phone_e164);
create index if not exists web_events_name_created_idx on public.web_events (name, created_at desc);
```

RLS enabled on both (service key bypasses), consistent with existing tables.

### Reconciliation
When the bot creates/updates a `teachers` row, extract the E.164 phone from
`wa_from` (`whatsapp:+9198…`) and match against `signups.phone_e164`. On a hit, set
`signups.teacher_id` + `matched_at`. This links the upstream funnel (view → signup →
tap) to the bot funnel (join → activated → worksheet → D7). Phone normalization uses
the form's country to produce E.164 (e.g. `98765 43210` + India → `+919876543210`).

## Pages & User Flow

SPA with four routes:

1. **`/` Landing** — dark canvas, lime accent, bold wordmark. Left: headline +
   subhead + primary CTA. Right: Spark the orb. Nav with pill active-tab. Below
   fold: 2–3 "what TeachSpark does" blurbs sourced from `pitch.md`. Fires
   `landing_view` on load.

**Persistent Sign-up CTA:** the sign-up button lives in the nav bar and is shown on
every public/marketing surface where the teacher has not yet signed up — i.e. the
landing page (also as the hero CTA) and any future about/marketing sections. It is
**not** shown on `/join` (already on the form), `/joined` (already signed up; CTA
there is "Open WhatsApp"), or `/admin` (wrong audience).

**Sign-up button styling — animated neon border:** the CTA has a green neon glowing
"traveling light" border — a rotating conic-gradient that chases around the
perimeter with a soft neon bloom, plus a subtle green halo that pulses on hover.
Pure CSS (conic-gradient + animated `@property` angle + blur), GPU-light. Under
`prefers-reduced-motion` the glow remains but the border motion/pulse stops.
2. **`/join` Sign-up** — Name, Profession, Organization/School, WhatsApp Number
   (with country-code selector), City, Country. Inline validation (phone valid for
   country). Hidden honeypot field. Consent line: *"We'll only use this to connect
   you to TeachSpark on WhatsApp. No student data, ever."* Submit → `POST /api/signup`
   → store row, fire `signup_submitted` → advance to `/joined`.
3. **`/joined` Hand-off** — big **"Open WhatsApp & Join"** button deep-linking
   `wa.me/14155238886?text=join%20captain-cheese`, plus 3 numbered steps
   (tap → send the pre-filled join → type *Hi*). Tap fires `join_tapped` and stamps
   `signups.join_tapped_at`. "Didn't work? tap again to rejoin" line (sandbox
   re-join reality).
4. **`/admin` Dashboard** — login (admin password → existing `ADMIN_TOKEN`, exchanged
   for an httpOnly session cookie; token never in URL), then the analytics.

**Flow:** land → orb delights → *Get started* → form → join screen → tap into
WhatsApp. Every arrow is an event.

**Responsive:** phone — orb above the headline, nav collapses, full-width fields,
thumb-sized join button. Verified at 375px and 768px; desktop unchanged.

## Spark — the Interactive Orb

CSS/SVG orb (radial gradients, inner glow, drop shadow + floor reflection). Two SVG
eyes on top. No 3D engine — pure SVG + CSS transforms, light for the PWA.

- **Cursor tracking:** on `mousemove`, compute the angle from each eye center to the
  cursor, translate pupils along that vector clamped to a small radius; eased via
  `requestAnimationFrame`. Whole orb does subtle parallax tilt toward the cursor.
  Touch devices (no hover): gentle idle drift + blinks.
- **Eye states (5):**
  - *Default* — big cute rounded eyes.
  - *Puppy* — larger, highlight glint, slight downward tilt; on orb hover.
  - *Starry* — star sparkle pupils; on `/joined` and CTA hover.
  - *Blink* — squash to a line every few seconds, idle.
  - *Happy* — "^ ^" curved-up, a beat after form submit.
  Each state = a small set of SVG shapes cross-faded with CSS transitions. Triggers
  are simple (hover, route change, idle timer) — no complex state machine.
- **Reduced motion:** with `prefers-reduced-motion`, disable tracking/parallax; slow
  idle blinks only.

## Admin Dashboard

Single scrollable dashboard, three bands, dark + lime. Served by one
`GET /api/admin/metrics` that extends `computeFunnel()` with the upstream data.

- **Band 1 — Funnel:** Landing views → Signups → Join tapped → Joined WhatsApp →
  Activated → Worksheet delivered → Returned (D1/D7). First three from
  `web_events`/`signups`; rest from bot events via reconciliation. Each step shows
  count + % of previous.
- **Band 2 — Lead vs Lag cards:**
  - *Lead:* sign-up conversion %, join-tap rate, sign-ups today/this week,
    view→signup rate.
  - *Lag:* activated, worksheets + papers delivered, median minutes saved, D1/D7
    return, referrals.
  Big number per card + sparkline where daily data exists.
- **Band 3 — Demographics (SVG bars):** profession, city, country (form); grade,
  subject, board (bot). Ranked horizontal bars (top values + "other").

**Mechanics:** auth via existing `ADMIN_TOKEN` → httpOnly session cookie at `/admin`
login. Data fetched once on load + manual refresh button (no live polling). Metrics
computed server-side by extending `computeFunnel()` so logic stays in one tested
place.

## API Surface (new)

- `POST /api/signup` — body: form fields + honeypot. Validates, normalizes phone,
  inserts `signups` row, records `signup_submitted`. Rate-limited per IP; honeypot
  rejects bots. Returns the `wa.me` join URL + signup id.
- `POST /api/events` — body: `{ visitor_id, name, signup_id? }` for `landing_view`
  and `join_tapped`. Records `web_events`; stamps `signups.join_tapped_at` on
  `join_tapped`.
- `POST /api/admin/login` — body: `{ password }`. Compares to `ADMIN_TOKEN`, sets
  httpOnly session cookie. Rate-limited.
- `GET /api/admin/metrics` — requires session cookie (or existing Bearer token for
  backward compatibility). Returns extended funnel + demographics.
- Static file serving for the built SPA (fallback to `index.html` for client routes,
  excluding `/api`, `/webhooks`, `/health`, `/internal`).

## Non-Functional Requirements / Gates

- **PWA:** web manifest (name, icons, theme color, standalone), service worker
  caching the app shell for offline load + installability.
- **OG link preview:** `og:*` + `twitter:card` tags in the static `index.html`, a
  purpose-built 1200×630 `og-cover.png` in the build's static root, absolute HTTPS
  URLs on the production domain. Verified via Post Inspector + opengraph.xyz.
- **Mobile responsive:** no horizontal scroll at 375px; nav reachable; readable
  without zoom; verified at 375px and 768px.
- **Accessibility:** `prefers-reduced-motion` respected; form fields labeled; color
  contrast on the dark theme meets AA for text.
- **Security/abuse:** honeypot + per-IP rate limit on public write endpoints; admin
  behind session auth; PII limited to teacher contact info (no student data).

## Success Criteria

- A teacher can go land → sign up → tap into WhatsApp on a phone with no horizontal
  scroll and no confusion about the 3 join steps.
- Every funnel stage from landing view to D7 return is visible in `/admin`, with the
  pre-join and post-join halves correctly joined by phone number.
- Demographics (profession/city/country/grade/subject/board) render from real data.
- Pasting the production URL into WhatsApp/LinkedIn unfurls with title, description,
  and the OG image.
- The app installs as a PWA and loads its shell offline.

## Open Questions for Implementation Plan

- Exact React tooling choices (router, form lib vs hand-rolled) — decide in plan.
- Country-code / phone-validation library (e.g. libphonenumber-js) vs minimal
  hand-rolled for India-first pilot.
- Whether reconciliation runs inline on teacher upsert or as a periodic sweep.

# PRD — Admin analytics dashboard

**Status:** design approved 2026-08-22 (three decisions below answered directly by Tushar).
**Branch:** `feat/landing-pwa`. Lands before the Railway deploy, shipping with Phase 1.

## Problem

The original brief asked for an admin view of "event tracking, metrics, lagging and leading
metrics, demographics". None of it exists. There is one route — `GET /admin/metrics` — returning
raw JSON behind a `Bearer` header, with no page, no login, and nothing about the landing funnel.

Phase 1 deliberately scoped this out. It is now in scope.

## Decisions taken (asked, not assumed)

1. **Login: signed cookie session.** No user table for a single-operator pilot.
2. **PII: masked, list visible.** Names, professions, cities and join status on screen; phone
   numbers masked.
3. **Sequence: build now, deploy after** — ships with Phase 1 in one deploy.

## Authentication

There is no user model and no reason to invent one. The credential that already exists is
`ADMIN_TOKEN`.

- `POST /api/admin/login {token}` — rate limited, compared with `crypto.timingSafeEqual`.
- On success: `Set-Cookie: ts_admin=<expiresAtMs>.<base64url HMAC-SHA256(expiresAtMs, ADMIN_TOKEN)>`
  with `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=12h`, and `Secure` whenever the request
  arrived over HTTPS (so local http dev still works; `trust proxy` is already 1).
- Stateless — no session store. Validation recomputes the HMAC and checks the expiry.
- **Rotating `ADMIN_TOKEN` invalidates every session**, which is the revocation mechanism.
- `POST /api/admin/logout` clears the cookie.
- Protected routes accept **either** the cookie or the existing `Authorization: Bearer` header, so
  curl and any monitoring keep working unchanged.

Why a cookie rather than the token in `sessionStorage`: this page renders real teachers' names and
cities. `HttpOnly` means a script-injection bug cannot read the credential.

**Two existing weaknesses fixed here**, because a login form on a public URL makes both real:

- `src/http/app.ts` compares the bearer token with `!==` — not constant time.
- `ADMIN_TOKEN` has a floor of 8 characters and attempts are currently unlimited. The login
  endpoint gets its own tight rate limit (10 per 15 min per IP).

No CSRF token: `SameSite=Strict` plus the fact that the only state-changing endpoints are login
and logout is sufficient for a first-party tool.

## Routing

`/admin` must serve the SPA, which means removing `admin` from `NON_SPA_ROUTES`.

The final review said `/admin/metrics` must move first. That is half right — Express matches a
registered route before the SPA fallback, so the endpoint keeps working either way. The real
constraint is the **service worker**: with `admin` off the denylist, an installed PWA navigating
to `/admin/metrics` would be handed the app shell. Moving the endpoint under `/api` avoids that,
since `/api` stays on the list.

- New: `GET /api/admin/metrics`, mounted **before** the general `/api` router so it is not
  swallowed by the `/api` 404 catch-all.
- `GET /admin/metrics` stays as a deprecated alias for one release so the runbook and any
  monitoring do not break on deploy day.
- `admin` removed from both copies of `NON_SPA_ROUTES`; the `.source` equality test stays.

## Data

Extends `Funnel` and adds the landing side, so both acquisition paths are visible at once —
folding in the metrics work queued separately.

```
{
  funnel:  { …existing computeFunnel output… },
  landing: {
    signups, joinTapped, matched,
    byProfession, byCity, byCountry, bySource,
    recent: [{ id, name, profession, organization, city, country, phone, joinTappedAt, createdAt }]
  },
  webEvents:   { landing_view, signup_submitted, join_tapped },
  generatedAt
}
```

**Phones are masked server-side**, not in the UI — the full list never reaches the browser on a
normal load. `?phones=full` returns them unmasked for reconciliation, making that a deliberate act
rather than the default.

**A metric that must be labelled, not silently trusted:** `joinTapped` is not exact.
`POST /api/signup` returns a usable `signupId` for an already-registered phone, so a caller can
stamp `join_tapped_at` on a row that is not theirs. Accepted for the pilot; the dashboard says so
next to the number.

## Sections

1. **Acquisition** — WhatsApp-direct vs landing funnel, side by side. `matched` explains the
   overlap rather than double-counting, since a landing signup can later become a teacher.
2. **Leading indicators** — landing views, signups, join taps, onboarding started.
3. **Lagging indicators** — activated teachers, papers exported, median minutes saved, referrals.
4. **Demographics** — profession, city, country, source.
5. **Recent signups** — the per-teacher list, phones masked.

## Non-goals

- No date-range filtering, no charts library, no CSV export, no real-time updates. Numbers and
  simple bars. Adding a charting dependency for a handful of counts is bytes for nothing.
- No second admin, no roles, no audit log.

## Success criteria

- A wrong token cannot get in, and repeated attempts are rate limited.
- The cookie is `HttpOnly` and unreadable from JavaScript.
- `Bearer` access to the metrics endpoint still works.
- The bot's existing routes are untouched; `/admin/metrics` still answers.
- All four screen states exist — loading, empty, error with a real retry, populated — plus the
  logged-out state.
- Responsive at 375 and 768 with no horizontal scroll, per the standing gate.

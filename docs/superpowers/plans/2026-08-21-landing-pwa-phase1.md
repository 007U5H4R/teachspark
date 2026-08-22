# TeachSpark Landing PWA — Phase 1 (Recruiting Funnel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public recruiting funnel — a dark/lime landing PWA with the cursor-tracking "Spark" orb, a demographics sign-up form, and a `wa.me` tap-to-join hand-off — served by the existing Express app, with every funnel step (`landing_view` → `signup_submitted` → `join_tapped`) recorded in Supabase.

**Architecture:** A Vite + React SPA lives in a new npm workspace `web/`, builds to `web/dist`, and is served as static files by the existing Express 5 app (same Railway deploy, same domain). Express gains a `/api` router (`POST /api/signup`, `POST /api/events`, `GET /api/countries`) backed by two new tables (`signups`, `web_events`) through the repo's existing ports/adapters pattern (interface in `src/ports.ts` → `InMemory*` fake + `Supabase*` implementation). Phase 2 (admin dashboard + phone reconciliation) is a separate plan and is **not** built here.

**Tech Stack:** Node 24 LTS (Railway) / 26 local · TypeScript 7 · Express 5.2 · zod 4 · Supabase JS · libphonenumber-js (`/max` build) · express-rate-limit 8 · Vite 8 · React 19 · react-router 8 · vite-plugin-pwa 1.3 · vitest 4 (+ jsdom, Testing Library) · @resvg/resvg-js (brand assets script)

**Spec:** `docs/superpowers/specs/2026-08-21-teachspark-landing-pwa-design.md`

## Global Constraints

- **Branch:** all work on `feat/landing-pwa` (already exists, off `main`). Never commit to `main`.
- **Node:** Railway resolves `engines.node` to the latest **24.x**; local is 26.7. Everything must pass on both. Root `engines.node` becomes `">=24.15"` (jsdom 30 floor).
- **Express 5 route syntax:** catch-alls are `'/{*splat}'` and `'/api{/*splat}'`. The Express 4 forms `'*'`, `'/*'`, `'/api/*'` **throw at boot**.
- **react-router v8:** import *everything* from `'react-router'`. Never add `react-router-dom` (no v8 line exists; mixing installs two routers).
- **Phone validation:** server uses `libphonenumber-js/max` (the default/`min` build is length-only and accepts invalid Indian numbers). Always call `.isValid()` — a non-`undefined` parse result is not "valid".
- **Rate-limit / proxy:** keep `app.set('trust proxy', 1)` exactly (Railway = one hop). Never `true`.
- **Service worker must never intercept** `/api`, `/webhooks`, `/admin`, `/internal`, `/health`. Denylist regex (single source of truth `web/pwa.routes.ts`): `/^\/(api|webhooks|admin|internal|health)(?=[\/?#]|$)/`.
- **Join link:** the only way a teacher joins is tapping the `wa.me` deep link. The server **never** sends a WhatsApp message to an un-joined number (Twilio sandbox error 63015).
- **Design tokens (exact):** bg `#0a0a0a`, elevated `#141414`, card `#181818`, border `#262626`, text `#f5f5f5`, muted `#a3a3a3`, lime `#b6ff3b`, orb green `#169a3c`. Font: Inter (Google Fonts) → `system-ui` fallback. Radius 20px; pills 999px.
- **Copy source:** product blurbs come from `docs/pilot/pitch.md` (worksheet in ~2 min · 3 levels + answer key · PDF · reusable prompt · `PAPER` → question paper as Word). Consent line verbatim: *"We'll only use this to connect you to TeachSpark on WhatsApp. No student data, ever."*
- **Mandatory done-gates** (user's global rules): mobile-responsive (no horizontal scroll at 375px; nav usable; readable without zoom; verified at 375 & 768, desktop unchanged), OG/Twitter link preview with a 1200×630 `og-cover.png` < 1 MB at **absolute HTTPS** URLs, installable PWA.
- **Commits:** small, per task, message style `feat(web): …` / `feat(api): …` / `test: …` / `docs: …`. Every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01GvqudMaGxVbdUSzoQXg3ST`.
- **Test commands:** root `npm test` runs BOTH vitest projects (`api` + `web`) after Task 6. Before Task 6 it runs the API tests only. `npm run typecheck` must be clean after every task.
- **No secrets in the client bundle:** Vite `envPrefix` is exactly `['VITE_', 'PUBLIC_BASE_URL']`.

---

## File Structure

**Server (existing package, `src/`)**
- `src/domain/web.ts` — **new.** `Signup`, `SignupCreateInput`, `WebEventRow`, `WebEventInput`, `WEB_EVENT`, `PROFESSIONS`, `DuplicateSignupError`. Pure types/constants.
- `src/domain/phone.ts` — **new.** `normalizePhone(raw, country)` → E.164 or `{ error: 'invalid' }`.
- `src/domain/countries.ts` — **new.** `COUNTRY_OPTIONS` (ISO code, English name, calling code), built from libphonenumber + `Intl.DisplayNames`.
- `src/ports.ts` — **modify.** Add `SignupRepo`, `WebEventLog` interfaces.
- `src/adapters/memory.ts` — **modify.** Add `InMemorySignupRepo`, `InMemoryWebEventLog`.
- `src/adapters/supabase.ts` — **modify.** Add `SupabaseSignupRepo`, `SupabaseWebEventLog` + row mappers.
- `src/http/api.ts` — **new.** `createApiRouter(deps)` with `/signup`, `/events`, `/countries` + rate limiters.
- `src/http/static.ts` — **new.** `WEB_DIST`, `mountSpa(app, dir)` (static files + SPA fallback + cache headers).
- `src/http/app.ts` — **modify.** JSON body parser, mount `/api`, API 404, SPA, status-aware error handler; `AppDeps` gains `signups`, `webEvents`, `join`, `webDist`.
- `src/index.ts` — **modify.** Wire the new adapters/deps.
- `supabase/migrations/20260823000000_web_signups.sql` — **new.**
- `scripts/brand-assets.ts` — **new.** Renders `web/public/og-cover.png` + PWA icons + `favicon.svg` from inline SVG via resvg.
- `assets/fonts/Inter-Bold.ttf`, `Inter-Regular.ttf`, `OFL.txt` — **new, vendored** (for the script only).
- `test/web-domain.test.ts`, `test/phone.test.ts`, `test/countries.test.ts`, `test/supabase-web-mappers.test.ts`, `test/api.test.ts`, `test/static.test.ts`, `test/fixtures/web-dist/**` — **new.** `test/app.test.ts`, `test/supabase.int.test.ts` — **modify.**
- Root `package.json` (workspaces, scripts, engines, deps), `package-lock.json` (regenerated), `vitest.config.ts` (projects), `.nvmrc` — **modify/new.**

**Client (new workspace `web/`)**
- `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/pwa.routes.ts`, `web/index.html`, `web/public/*` (generated assets), `web/test/setup.ts`
- `web/src/main.tsx` — entry (router + SW registration).
- `web/src/App.tsx` — routes + shell; `web/src/lib/nav.ts` — `showSignupCta(pathname)`.
- `web/src/styles/tokens.css`, `web/src/styles/global.css` — design system.
- `web/src/components/Nav.tsx`, `web/src/components/NeonButton.tsx` + `NeonButton.css` — nav with persistent neon sign-up CTA.
- `web/src/components/spark/eyes.ts` (pure math), `Spark.tsx`, `Spark.css` — the orb.
- `web/src/lib/api.ts`, `web/src/lib/visitor.ts`, `web/src/lib/session.ts`, `web/src/lib/validate.ts` — API client, anonymous visitor id, sessionStorage hand-off, form validation.
- `web/src/pages/Landing.tsx`, `Join.tsx`, `Joined.tsx`.
- `web/test/*.test.ts(x)` — one per unit above.

---

### Task 1: Domain types, ports, in-memory fakes, migration

**Files:**
- Create: `src/domain/web.ts`
- Modify: `src/ports.ts` (append after `PapersRepo`)
- Modify: `src/adapters/memory.ts` (append at end)
- Create: `supabase/migrations/20260823000000_web_signups.sql`
- Test: `test/web-domain.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 4):
  ```ts
  // src/domain/web.ts
  export const WEB_EVENT = { landing_view: 'landing_view', signup_submitted: 'signup_submitted', join_tapped: 'join_tapped' } as const;
  export type WebEventName = (typeof WEB_EVENT)[keyof typeof WEB_EVENT];
  export const PROFESSIONS = ['school_teacher', 'tutor', 'school_leader', 'teacher_trainer', 'parent', 'student', 'other'] as const;
  export type Profession = (typeof PROFESSIONS)[number];
  export interface Signup { id: string; name: string; profession: Profession; organization: string | null; phoneE164: string; phoneRaw: string; city: string; country: string; source: string | null; joinTappedAt: Date | null; teacherId: string | null; matchedAt: Date | null; createdAt: Date }
  export interface SignupCreateInput { name: string; profession: Profession; organization: string | null; phoneE164: string; phoneRaw: string; city: string; country: string; source: string | null; now: Date }
  export interface WebEventRow { visitorId: string | null; name: WebEventName; signupId: string | null; properties: Record<string, unknown>; createdAt: Date }
  export interface WebEventInput { visitorId: string | null; name: WebEventName; signupId: string | null; properties?: Record<string, unknown> }
  export class DuplicateSignupError extends Error { constructor(public readonly existing: Signup) }
  // src/ports.ts
  export interface SignupRepo { create(input: SignupCreateInput): Promise<Signup>; findById(id: string): Promise<Signup | null>; findByPhoneE164(e164: string): Promise<Signup | null>; markJoinTapped(id: string, at: Date): Promise<void>; listAll(): Promise<Signup[]> }
  export interface WebEventLog { log(input: WebEventInput, at: Date): Promise<void>; listAll(): Promise<WebEventRow[]> }
  ```

- [ ] **Step 1: Write the failing test**

```ts
// test/web-domain.test.ts
import { describe, it, expect } from 'vitest';
import { InMemorySignupRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';
import { DuplicateSignupError, WEB_EVENT, PROFESSIONS } from '../src/domain/web.js';

const now = new Date('2026-08-23T10:00:00Z');
const input = { name: 'Meera', profession: 'school_teacher' as const, organization: 'DPS', phoneE164: '+919876543210', phoneRaw: '98765 43210', city: 'Pune', country: 'IN', source: null, now };

describe('InMemorySignupRepo', () => {
  it('creates, finds by id and by phone, and lists', async () => {
    const repo = new InMemorySignupRepo();
    const s = await repo.create(input);
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
    expect(s.joinTappedAt).toBeNull();
    expect(s.teacherId).toBeNull();
    expect(s.createdAt).toEqual(now);
    expect(await repo.findById(s.id)).toEqual(s);
    expect(await repo.findByPhoneE164('+919876543210')).toEqual(s);
    expect(await repo.findByPhoneE164('+910000000000')).toBeNull();
    expect(await repo.listAll()).toHaveLength(1);
  });
  it('rejects a second signup with the same phone with DuplicateSignupError carrying the existing row', async () => {
    const repo = new InMemorySignupRepo();
    const first = await repo.create(input);
    await expect(repo.create({ ...input, name: 'Again' })).rejects.toBeInstanceOf(DuplicateSignupError);
    await repo.create({ ...input, name: 'Again' }).catch((e: DuplicateSignupError) => expect(e.existing.id).toBe(first.id));
  });
  it('markJoinTapped sets the timestamp once and is idempotent', async () => {
    const repo = new InMemorySignupRepo();
    const s = await repo.create(input);
    await repo.markJoinTapped(s.id, now);
    const later = new Date(now.getTime() + 60_000);
    await repo.markJoinTapped(s.id, later);
    expect((await repo.findById(s.id))?.joinTappedAt).toEqual(now);
    await expect(repo.markJoinTapped('missing', now)).rejects.toThrow(/not found/);
  });
});

describe('InMemoryWebEventLog', () => {
  it('logs and lists rows with defaults', async () => {
    const log = new InMemoryWebEventLog();
    await log.log({ visitorId: 'v1', name: WEB_EVENT.landing_view, signupId: null }, now);
    await log.log({ visitorId: null, name: WEB_EVENT.join_tapped, signupId: 's1', properties: { a: 1 } }, now);
    const rows = await log.listAll();
    expect(rows).toEqual([
      { visitorId: 'v1', name: 'landing_view', signupId: null, properties: {}, createdAt: now },
      { visitorId: null, name: 'join_tapped', signupId: 's1', properties: { a: 1 }, createdAt: now },
    ]);
    expect(log.names()).toEqual(['landing_view', 'join_tapped']);
  });
});

describe('constants', () => {
  it('exposes the profession enum used by the form and the API', () => {
    expect(PROFESSIONS).toContain('school_teacher');
    expect(PROFESSIONS).toContain('other');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/web-domain.test.ts`
Expected: FAIL — `Cannot find module '../src/domain/web.js'` / `InMemorySignupRepo` not exported.

- [ ] **Step 3: Create `src/domain/web.ts`**

```ts
// Pre-WhatsApp funnel: a web sign-up and the anonymous events around it.
// These rows exist BEFORE a teachers row does (the bot only knows a teacher after the sandbox join),
// which is why they are separate tables and not more events on the teacher.
export const WEB_EVENT = {
  landing_view: 'landing_view',
  signup_submitted: 'signup_submitted',
  join_tapped: 'join_tapped',
} as const;
export type WebEventName = (typeof WEB_EVENT)[keyof typeof WEB_EVENT];

export const PROFESSIONS = ['school_teacher', 'tutor', 'school_leader', 'teacher_trainer', 'parent', 'student', 'other'] as const;
export type Profession = (typeof PROFESSIONS)[number];

export interface Signup {
  id: string;
  name: string;
  profession: Profession;
  organization: string | null;
  phoneE164: string; // canonical key, e.g. "+919876543210"; Phase 2 matches teachers.wa_from = `whatsapp:${phoneE164}`
  phoneRaw: string;  // as typed, for debugging normalization complaints
  city: string;
  country: string;   // ISO 3166-1 alpha-2, uppercase
  source: string | null; // optional ?src= attribution from the landing URL
  joinTappedAt: Date | null;
  teacherId: string | null; // filled by Phase 2 reconciliation
  matchedAt: Date | null;
  createdAt: Date;
}

export interface SignupCreateInput {
  name: string;
  profession: Profession;
  organization: string | null;
  phoneE164: string;
  phoneRaw: string;
  city: string;
  country: string;
  source: string | null;
  now: Date;
}

export interface WebEventRow {
  visitorId: string | null;
  name: WebEventName;
  signupId: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
}

export interface WebEventInput {
  visitorId: string | null;
  name: WebEventName;
  signupId: string | null;
  properties?: Record<string, unknown>;
}

/** Thrown by SignupRepo.create when phone_e164 already exists; carries the existing row so the API can answer "welcome back". */
export class DuplicateSignupError extends Error {
  constructor(public readonly existing: Signup) {
    super(`signup already exists for ${existing.phoneE164}`);
    this.name = 'DuplicateSignupError';
  }
}
```

- [ ] **Step 4: Append the ports to `src/ports.ts`**

Add to the type import at the top of `src/ports.ts` (it currently imports only from `./domain/types.js`):

```ts
import type { Signup, SignupCreateInput, WebEventInput, WebEventRow } from './domain/web.js';
```

Append at the end of the file:

```ts
export interface SignupRepo {
  /** throws DuplicateSignupError when phone_e164 already exists */
  create(input: SignupCreateInput): Promise<Signup>;
  findById(id: string): Promise<Signup | null>;
  findByPhoneE164(e164: string): Promise<Signup | null>;
  /** sets join_tapped_at only if it is still null; throws if id is unknown */
  markJoinTapped(id: string, at: Date): Promise<void>;
  listAll(): Promise<Signup[]>;
}

export interface WebEventLog {
  log(input: WebEventInput, at: Date): Promise<void>;
  listAll(): Promise<WebEventRow[]>;
}
```

- [ ] **Step 5: Append the fakes to `src/adapters/memory.ts`**

Add to the imports at the top:

```ts
import { DuplicateSignupError, type Signup, type SignupCreateInput, type WebEventInput, type WebEventRow } from '../domain/web.js';
import type { SignupRepo, WebEventLog } from '../ports.js';
```
(Merge `SignupRepo, WebEventLog` into the existing `import type { ... } from '../ports.js'` list rather than adding a second import.)

Append at the end of the file:

```ts
export class InMemorySignupRepo implements SignupRepo {
  private byId = new Map<string, Signup>();

  async create(input: SignupCreateInput): Promise<Signup> {
    const existing = await this.findByPhoneE164(input.phoneE164);
    if (existing) throw new DuplicateSignupError(existing);
    const s: Signup = {
      id: randomUUID(),
      name: input.name,
      profession: input.profession,
      organization: input.organization,
      phoneE164: input.phoneE164,
      phoneRaw: input.phoneRaw,
      city: input.city,
      country: input.country,
      source: input.source,
      joinTappedAt: null,
      teacherId: null,
      matchedAt: null,
      createdAt: new Date(input.now.getTime()),
    };
    this.byId.set(s.id, s);
    return { ...s };
  }

  async findById(id: string): Promise<Signup | null> {
    const s = this.byId.get(id);
    return s ? { ...s } : null;
  }

  async findByPhoneE164(e164: string): Promise<Signup | null> {
    for (const s of this.byId.values()) if (s.phoneE164 === e164) return { ...s };
    return null;
  }

  async markJoinTapped(id: string, at: Date): Promise<void> {
    const s = this.byId.get(id);
    if (!s) throw new Error(`signup ${id} not found`);
    if (s.joinTappedAt === null) this.byId.set(id, { ...s, joinTappedAt: new Date(at.getTime()) });
  }

  async listAll(): Promise<Signup[]> {
    return [...this.byId.values()].map((s) => ({ ...s }));
  }
}

export class InMemoryWebEventLog implements WebEventLog {
  rows: WebEventRow[] = [];
  async log(input: WebEventInput, at: Date): Promise<void> {
    this.rows.push({ visitorId: input.visitorId, name: input.name, signupId: input.signupId, properties: input.properties ?? {}, createdAt: new Date(at.getTime()) });
  }
  async listAll(): Promise<WebEventRow[]> {
    return [...this.rows];
  }
  names(): string[] {
    return this.rows.map((r) => r.name);
  }
}
```

- [ ] **Step 6: Write the migration `supabase/migrations/20260823000000_web_signups.sql`**

```sql
-- Landing PWA (Phase 1): pre-WhatsApp funnel. Run in the Supabase SQL editor (or `supabase db push`).
create table if not exists public.signups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  profession     text not null,            -- one of PROFESSIONS in src/domain/web.ts
  organization   text,
  phone_e164     text not null,            -- canonical; Phase 2 matches teachers.wa_from = 'whatsapp:' || phone_e164
  phone_raw      text not null,
  city           text not null,
  country        text not null,            -- ISO 3166-1 alpha-2, uppercase
  source         text,
  join_tapped_at timestamptz,
  teacher_id     uuid references public.teachers(id) on delete set null, -- filled by Phase 2 reconciliation
  matched_at     timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists signups_phone_e164_idx on public.signups (phone_e164);
create index if not exists signups_created_idx on public.signups (created_at desc);

create table if not exists public.web_events (
  id         uuid primary key default gen_random_uuid(),
  visitor_id text,                          -- anonymous id from localStorage
  name       text not null,                 -- landing_view | signup_submitted | join_tapped
  signup_id  uuid references public.signups(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists web_events_name_created_idx on public.web_events (name, created_at desc);
create index if not exists web_events_signup_idx on public.web_events (signup_id);

-- Tables created via SQL do NOT get RLS automatically. Enable it; the service key bypasses RLS.
alter table public.signups    enable row level security;
alter table public.web_events enable row level security;
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm test -- test/web-domain.test.ts && npm run typecheck`
Expected: 5 tests PASS; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/domain/web.ts src/ports.ts src/adapters/memory.ts supabase/migrations/20260823000000_web_signups.sql test/web-domain.test.ts
git commit -m "feat(api): signups + web_events domain, ports, fakes, migration"
```

---

### Task 2: Phone normalization + country list

**Files:**
- Create: `src/domain/phone.ts`, `src/domain/countries.ts`
- Modify: `package.json` (dependency)
- Test: `test/phone.test.ts`, `test/countries.test.ts`

**Interfaces:**
- Produces (used by Task 4):
  ```ts
  export type NormalizePhoneResult = { e164: string } | { error: 'invalid' };
  export function normalizePhone(raw: string, country: string): NormalizePhoneResult;
  export interface CountryOption { code: string; name: string; callingCode: string }
  export function buildCountryOptions(locale?: string): CountryOption[];
  export const COUNTRY_OPTIONS: CountryOption[];
  ```

- [ ] **Step 1: Install the dependency**

Run: `npm i libphonenumber-js@^1.13.11`
Expected: `package.json` dependencies gains `"libphonenumber-js": "^1.13.11"`; lockfile updated.

- [ ] **Step 2: Write the failing tests**

```ts
// test/phone.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../src/domain/phone.js';

describe('normalizePhone', () => {
  it('normalizes an Indian mobile typed in national format to E.164', () => {
    expect(normalizePhone('98765 43210', 'IN')).toEqual({ e164: '+919876543210' });
    expect(normalizePhone('098765-43210', 'IN')).toEqual({ e164: '+919876543210' }); // trunk 0 stripped
    expect(normalizePhone('98765 43210', 'in')).toEqual({ e164: '+919876543210' }); // lowercase country tolerated
  });
  it('rejects numbers that are too short, garbage, or for an unknown country', () => {
    expect(normalizePhone('12345', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('abc', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('', 'IN')).toEqual({ error: 'invalid' });
    expect(normalizePhone('98765 43210', 'XX')).toEqual({ error: 'invalid' });
    expect(normalizePhone('0123456789', 'IN')).toEqual({ error: 'invalid' }); // needs the /max metadata to catch
  });
  it('lets an explicit +<calling code> override the dropdown country', () => {
    expect(normalizePhone('+1 415 555 2671', 'IN')).toEqual({ e164: '+14155552671' });
    expect(normalizePhone('+91 98765 43210', 'US')).toEqual({ e164: '+919876543210' });
  });
  it('does not extract a number out of surrounding prose', () => {
    expect(normalizePhone('call me at 9876543210 pls', 'IN')).toEqual({ error: 'invalid' });
  });
  it('never throws on non-string input', () => {
    expect(normalizePhone(undefined as unknown as string, 'IN')).toEqual({ error: 'invalid' });
  });
});
```

```ts
// test/countries.test.ts
import { describe, it, expect } from 'vitest';
import { buildCountryOptions, COUNTRY_OPTIONS } from '../src/domain/countries.js';

describe('country options', () => {
  it('includes India with calling code 91 and English names', () => {
    const india = COUNTRY_OPTIONS.find((c) => c.code === 'IN');
    expect(india).toEqual({ code: 'IN', name: 'India', callingCode: '91' });
  });
  it('is sorted by name, has no duplicate codes, and has 200+ entries', () => {
    const names = COUNTRY_OPTIONS.map((c) => c.name);
    expect([...names].sort(new Intl.Collator('en').compare)).toEqual(names);
    expect(new Set(COUNTRY_OPTIONS.map((c) => c.code)).size).toBe(COUNTRY_OPTIONS.length);
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(200);
  });
  it('every option has a two-letter uppercase code and a numeric calling code', () => {
    for (const c of buildCountryOptions()) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.callingCode).toMatch(/^\d{1,4}$/);
      expect(c.name.length).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- test/phone.test.ts test/countries.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `src/domain/phone.ts`**

```ts
// The /max build is the only one whose isValid() checks national digit patterns: the default (/min)
// build is length-only and accepts e.g. 0123456789 for IN. Size is irrelevant on the server.
import { parsePhoneNumberFromString, isSupportedCountry } from 'libphonenumber-js/max';

export type NormalizePhoneResult = { e164: string } | { error: 'invalid' };

/**
 * @param raw     What the teacher typed: national format, or international with '+'. Spaces/dashes/brackets OK.
 * @param country ISO 3166-1 alpha-2 from the dropdown, e.g. 'IN'. A leading +<calling code> in raw wins over it.
 */
export function normalizePhone(raw: string, country: string): NormalizePhoneResult {
  if (typeof raw !== 'string' || typeof country !== 'string') return { error: 'invalid' }; // lib throws on non-strings
  const cc = country.toUpperCase();
  if (!isSupportedCountry(cc)) return { error: 'invalid' };
  // extract:false -- a form field is not prose; never pull a number out of "call me at 98765…"
  const parsed = parsePhoneNumberFromString(raw, { defaultCountry: cc, extract: false });
  if (!parsed || !parsed.isValid()) return { error: 'invalid' }; // '12345' returns an object with isValid() === false
  return { e164: parsed.number };
}
```

- [ ] **Step 5: Create `src/domain/countries.ts`**

```ts
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/max';

export interface CountryOption {
  code: string;        // ISO 3166-1 alpha-2 (plus AC/TA/XK which libphonenumber supports)
  name: string;        // English display name
  callingCode: string; // e.g. "91" (no '+')
}

export function buildCountryOptions(locale = 'en'): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
  const collator = new Intl.Collator(locale);
  return getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** Computed once at module load; served by GET /api/countries. */
export const COUNTRY_OPTIONS: CountryOption[] = buildCountryOptions();
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- test/phone.test.ts test/countries.test.ts && npm run typecheck`
Expected: 8 tests PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/domain/phone.ts src/domain/countries.ts test/phone.test.ts test/countries.test.ts
git commit -m "feat(api): E.164 phone normalization (libphonenumber max) + country options"
```

---

### Task 3: Supabase adapters for signups and web_events

**Files:**
- Modify: `src/adapters/supabase.ts` (append)
- Test: `test/supabase-web-mappers.test.ts` (new), `test/supabase.int.test.ts` (append a gated case)

**Interfaces:**
- Consumes: `SignupRepo`, `WebEventLog` (Task 1); `unwrap`, `createSupabase` already in the file.
- Produces (used by Task 4's `index.ts` wiring):
  ```ts
  export interface SignupRow { id: string; name: string; profession: string; organization: string | null; phone_e164: string; phone_raw: string; city: string; country: string; source: string | null; join_tapped_at: string | null; teacher_id: string | null; matched_at: string | null; created_at: string }
  export function rowToSignup(r: SignupRow): Signup;
  export function signupInputToRow(i: SignupCreateInput): Record<string, unknown>;
  export class SupabaseSignupRepo implements SignupRepo { constructor(sb: SupabaseClient) }
  export class SupabaseWebEventLog implements WebEventLog { constructor(sb: SupabaseClient) }
  ```

- [ ] **Step 1: Write the failing mapper test**

```ts
// test/supabase-web-mappers.test.ts
import { describe, it, expect } from 'vitest';
import { rowToSignup, signupInputToRow, type SignupRow } from '../src/adapters/supabase.js';

describe('signup mappers', () => {
  const row: SignupRow = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Meera', profession: 'school_teacher', organization: null,
    phone_e164: '+919876543210', phone_raw: '98765 43210', city: 'Pune', country: 'IN', source: 'grp-a',
    join_tapped_at: '2026-08-23T10:05:00.000Z', teacher_id: null, matched_at: null, created_at: '2026-08-23T10:00:00.000Z',
  };
  it('maps a row to the domain shape with Date fields', () => {
    const s = rowToSignup(row);
    expect(s).toEqual({
      id: row.id, name: 'Meera', profession: 'school_teacher', organization: null, phoneE164: '+919876543210', phoneRaw: '98765 43210',
      city: 'Pune', country: 'IN', source: 'grp-a', joinTappedAt: new Date('2026-08-23T10:05:00.000Z'), teacherId: null, matchedAt: null,
      createdAt: new Date('2026-08-23T10:00:00.000Z'),
    });
  });
  it('maps a create input to snake_case columns with created_at from now', () => {
    const now = new Date('2026-08-23T10:00:00.000Z');
    expect(signupInputToRow({ name: 'Meera', profession: 'tutor', organization: 'X', phoneE164: '+919876543210', phoneRaw: '98765', city: 'Pune', country: 'IN', source: null, now })).toEqual({
      name: 'Meera', profession: 'tutor', organization: 'X', phone_e164: '+919876543210', phone_raw: '98765', city: 'Pune', country: 'IN', source: null, created_at: '2026-08-23T10:00:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- test/supabase-web-mappers.test.ts`
Expected: FAIL — `rowToSignup` is not exported.

- [ ] **Step 3: Append the adapters to `src/adapters/supabase.ts`**

Extend the imports at the top:

```ts
import { DuplicateSignupError, type Profession, type Signup, type SignupCreateInput, type WebEventInput, type WebEventName, type WebEventRow } from '../domain/web.js';
import type { EventLog, GenerationSaveInput, GenerationStore, PaperSaveInput, PapersRepo, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';
```
(Replace the existing `import type { ... } from '../ports.js'` line with the second line above.)

Append at the end of the file:

```ts
export interface SignupRow {
  id: string;
  name: string;
  profession: string;
  organization: string | null;
  phone_e164: string;
  phone_raw: string;
  city: string;
  country: string;
  source: string | null;
  join_tapped_at: string | null;
  teacher_id: string | null;
  matched_at: string | null;
  created_at: string;
}

const SIGNUP_COLUMNS = 'id, name, profession, organization, phone_e164, phone_raw, city, country, source, join_tapped_at, teacher_id, matched_at, created_at';

export function rowToSignup(r: SignupRow): Signup {
  return {
    id: r.id,
    name: r.name,
    profession: r.profession as Profession,
    organization: r.organization,
    phoneE164: r.phone_e164,
    phoneRaw: r.phone_raw,
    city: r.city,
    country: r.country,
    source: r.source,
    joinTappedAt: toDate(r.join_tapped_at),
    teacherId: r.teacher_id,
    matchedAt: toDate(r.matched_at),
    createdAt: new Date(r.created_at),
  };
}

export function signupInputToRow(i: SignupCreateInput): Record<string, unknown> {
  return {
    name: i.name,
    profession: i.profession,
    organization: i.organization,
    phone_e164: i.phoneE164,
    phone_raw: i.phoneRaw,
    city: i.city,
    country: i.country,
    source: i.source,
    created_at: i.now.toISOString(),
  };
}

export class SupabaseSignupRepo implements SignupRepo {
  constructor(private sb: SupabaseClient) {}

  async create(input: SignupCreateInput): Promise<Signup> {
    const res = await this.sb.from('signups').insert(signupInputToRow(input)).select(SIGNUP_COLUMNS).single();
    if (res.error?.code === '23505') {
      // unique violation on phone_e164: surface the existing row so the API can say "welcome back"
      const existing = await this.findByPhoneE164(input.phoneE164);
      if (existing) throw new DuplicateSignupError(existing);
    }
    return rowToSignup(unwrap(res, 'signups.insert') as SignupRow);
  }

  async findById(id: string): Promise<Signup | null> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).eq('id', id).maybeSingle();
    if (res.error) throw new Error(`signups.findById failed: ${res.error.message}`);
    return res.data ? rowToSignup(res.data as SignupRow) : null;
  }

  async findByPhoneE164(e164: string): Promise<Signup | null> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).eq('phone_e164', e164).maybeSingle();
    if (res.error) throw new Error(`signups.findByPhoneE164 failed: ${res.error.message}`);
    return res.data ? rowToSignup(res.data as SignupRow) : null;
  }

  async markJoinTapped(id: string, at: Date): Promise<void> {
    // Only the first tap is recorded: the WHERE join_tapped_at IS NULL makes retries no-ops.
    const res = await this.sb.from('signups').update({ join_tapped_at: at.toISOString() }).eq('id', id).is('join_tapped_at', null).select('id');
    if (res.error) throw new Error(`signups.markJoinTapped failed: ${res.error.message}`);
    if ((res.data ?? []).length === 0) {
      const exists = await this.findById(id);
      if (!exists) throw new Error(`signup ${id} not found`);
    }
  }

  async listAll(): Promise<Signup[]> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).order('created_at', { ascending: true }).limit(5000);
    return (unwrap(res, 'signups.listAll') as SignupRow[]).map(rowToSignup);
  }
}

export class SupabaseWebEventLog implements WebEventLog {
  constructor(private sb: SupabaseClient) {}

  async log(input: WebEventInput, at: Date): Promise<void> {
    const { error } = await this.sb
      .from('web_events')
      .insert({ visitor_id: input.visitorId, name: input.name, signup_id: input.signupId, properties: input.properties ?? {}, created_at: at.toISOString() });
    if (error) throw new Error(`web_events.insert failed: ${error.message}`);
  }

  async listAll(): Promise<WebEventRow[]> {
    const res = await this.sb.from('web_events').select('visitor_id, name, signup_id, properties, created_at').order('created_at', { ascending: true }).limit(50000);
    const rows = unwrap(res, 'web_events.listAll') as Array<{ visitor_id: string | null; name: string; signup_id: string | null; properties: Record<string, unknown>; created_at: string }>;
    return rows.map((r) => ({ visitorId: r.visitor_id, name: r.name as WebEventName, signupId: r.signup_id, properties: r.properties ?? {}, createdAt: new Date(r.created_at) }));
  }
}
```

- [ ] **Step 4: Append a gated integration case to `test/supabase.int.test.ts`**

Inside the existing `describe.skipIf(!url || !key)(...)` block, add after the existing `it(...)`:

```ts
  it('round-trips a signup and a web event, and enforces the phone uniqueness', async () => {
    const { SupabaseSignupRepo, SupabaseWebEventLog } = await import('../src/adapters/supabase.js');
    const { DuplicateSignupError } = await import('../src/domain/web.js');
    const signups = new SupabaseSignupRepo(sb);
    const webEvents = new SupabaseWebEventLog(sb);
    const now = new Date();
    const phone = `+91${String(Date.now()).slice(-10)}`;
    const s = await signups.create({ name: 'Int Test', profession: 'tutor', organization: null, phoneE164: phone, phoneRaw: phone, city: 'Pune', country: 'IN', source: 'int', now });
    expect(s.joinTappedAt).toBeNull();
    await expect(signups.create({ name: 'Dup', profession: 'tutor', organization: null, phoneE164: phone, phoneRaw: phone, city: 'Pune', country: 'IN', source: null, now })).rejects.toBeInstanceOf(DuplicateSignupError);
    await signups.markJoinTapped(s.id, now);
    await signups.markJoinTapped(s.id, new Date(now.getTime() + 5000)); // idempotent
    const again = await signups.findById(s.id);
    expect(again?.joinTappedAt?.getTime()).toBe(now.getTime()); // first tap wins; timestamptz keeps ms precision
    await webEvents.log({ visitorId: 'int-visitor', name: 'join_tapped', signupId: s.id }, now);
    const rows = (await webEvents.listAll()).filter((r) => r.signupId === s.id);
    expect(rows).toHaveLength(1);
    await sb.from('signups').delete().eq('id', s.id); // cleanup (cascades web_events.signup_id to null)
  });
```

- [ ] **Step 5: Apply the migration to the Supabase project** *(human-in-the-loop; needed before the int test and before deploy)*

Paste `supabase/migrations/20260823000000_web_signups.sql` into the Supabase SQL editor for the TeachSpark project and run it. Expected: "Success. No rows returned."

- [ ] **Step 6: Run tests (int test runs only if `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are in the env)**

Run: `npm test -- test/supabase-web-mappers.test.ts && set -a && source .env && set +a && npm test -- test/supabase.int.test.ts && npm run typecheck`
Expected: mapper tests PASS; int suite PASS (2 tests) when env present; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/supabase.ts test/supabase-web-mappers.test.ts test/supabase.int.test.ts
git commit -m "feat(api): Supabase adapters for signups and web_events"
```

---

### Task 4: `/api` router — signup, events, countries, rate limits

**Files:**
- Create: `src/http/api.ts`
- Modify: `src/http/app.ts`, `src/index.ts`, `package.json`
- Test: `test/api.test.ts` (new), `test/helpers/web-deps.ts` (new), and the four existing files that construct `AppDeps` — `test/app.test.ts`, `test/health.test.ts`, `test/qa-e2e.test.ts`, `test/qa-paper-e2e.test.ts` — each gets `...webDeps()` spread into its deps (otherwise `npm run typecheck` fails: the new `AppDeps` fields are required).

**Interfaces:**
- Consumes: `SignupRepo`, `WebEventLog`, `DuplicateSignupError`, `WEB_EVENT`, `PROFESSIONS` (Task 1); `normalizePhone`, `COUNTRY_OPTIONS` (Task 2); `Clock` (existing).
- Produces:
  ```ts
  // src/http/api.ts
  export interface JoinInfo { url: string; code: string; whatsappNumber: string } // e.g. { url: 'https://wa.me/14155238886?text=join%20captain-cheese', code: 'captain-cheese', whatsappNumber: '+14155238886' }
  export interface ApiDeps { signups: SignupRepo; webEvents: WebEventLog; clock: Clock; join: JoinInfo }
  export function createApiRouter(deps: ApiDeps): express.Router;
  // HTTP contract (consumed by web/src/lib/api.ts in Task 9):
  // POST /api/signup    body {name, profession, organization?, phone, city, country, source?, visitorId?, website?}
  //                     201 {signupId, existing:false, join} | 200 {signupId, existing:true, join}
  //                     400 {error:'bad_request', fields?} | 422 {error:'invalid_phone'} | 429 {error:'rate_limited'}
  // POST /api/events    body {visitorId, name:'landing_view'|'join_tapped', signupId?} -> 204 | 400 | 404 {error:'not_found'}
  // GET  /api/countries 200 {countries: CountryOption[]} (Cache-Control: public, max-age=86400)
  // anything else under /api -> 404 {error:'not_found'}
  ```
  `AppDeps` (in `app.ts`) gains: `signups: SignupRepo; webEvents: WebEventLog; join: JoinInfo; webDist: string | null` (webDist is used by Task 5; pass `null` until then).

- [ ] **Step 1: Install express-rate-limit**

Run: `npm i express-rate-limit@^8.6.2`

- [ ] **Step 2: Add a shared test helper and spread it into every existing `createApp(...)` call** so the existing suites keep compiling once `AppDeps` grows. `grep -rn "createApp(" test/` must list exactly these four files: `test/app.test.ts`, `test/health.test.ts`, `test/qa-e2e.test.ts`, `test/qa-paper-e2e.test.ts`.

Create `test/helpers/web-deps.ts`:

```ts
// test/helpers/web-deps.ts
// The landing-page deps every existing createApp() call site needs once AppDeps grew (Task 4).
import { InMemorySignupRepo, InMemoryWebEventLog } from '../../src/adapters/memory.js';
import type { JoinInfo } from '../../src/http/api.js';

export const TEST_JOIN: JoinInfo = { url: 'https://wa.me/14155238886?text=join%20test-code', code: 'test-code', whatsappNumber: '+14155238886' };

export function webDeps() {
  return { signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(), join: TEST_JOIN, webDist: null as string | null };
}
```

Then, in each of the four files:

- `test/app.test.ts` and `test/health.test.ts` — both have an identical `makeDeps`; add the import `import { webDeps } from './helpers/web-deps.js';` and insert `...webDeps(),` as the first property of the `deps` object literal (before `config:`), so `...over` still wins:
  ```ts
  const deps: AppDeps = {
    ...webDeps(),
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: 'admin-secret', CRON_SECRET: 'cron-secret' },
    handleInbound: async (m) => { inbound.push(m); },
    runNudgePass: async () => 2,
    teachers: new InMemoryTeacherRepo(),
    events: new InMemoryEventLog(),
    clock: new FixedClock(new Date('2026-08-23T10:00:00Z')),
    ...over,
  };
  ```
- `test/qa-e2e.test.ts` (line ~127) and `test/qa-paper-e2e.test.ts` (line ~210) — add the same import and change the single `createApp({...})` call to:
  ```ts
  const app = createApp({ ...webDeps(), config, handleInbound, runNudgePass: createNudgePass(exec), teachers, events, clock });
  ```

Nothing else in those files changes. (The `test/helpers/` directory is new; vitest's default include is `**/*.test.ts`, so the helper is not collected as a suite.)

- [ ] **Step 3: Write the failing API tests**

```ts
// test/api.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';

const JOIN = { url: 'https://wa.me/14155238886?text=join%20test-code', code: 'test-code', whatsappNumber: '+14155238886' };
const now = new Date('2026-08-23T10:00:00Z');

function make(over: Partial<AppDeps> = {}) {
  const signups = new InMemorySignupRepo();
  const webEvents = new InMemoryWebEventLog();
  const deps: AppDeps = {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: 'a', CRON_SECRET: 'c' },
    handleInbound: async () => {}, runNudgePass: async () => 0,
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(),
    signups, webEvents, join: JOIN, webDist: null, clock: new FixedClock(now), ...over,
  };
  return { app: createApp(deps), signups, webEvents };
}

const valid = { name: 'Meera Iyer', profession: 'school_teacher', organization: 'DPS Pune', phone: '98765 43210', city: 'Pune', country: 'IN', visitorId: 'v-1', source: 'grp-a' };

describe('POST /api/signup', () => {
  it('201 creates the signup, logs signup_submitted, and returns the join info', async () => {
    const { app, signups, webEvents } = make();
    const res = await request(app).post('/api/signup').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.existing).toBe(false);
    expect(res.body.join).toEqual(JOIN);
    const stored = await signups.findById(res.body.signupId);
    expect(stored).toMatchObject({ name: 'Meera Iyer', phoneE164: '+919876543210', phoneRaw: '98765 43210', country: 'IN', source: 'grp-a', organization: 'DPS Pune' });
    expect(webEvents.rows).toEqual([{ visitorId: 'v-1', name: 'signup_submitted', signupId: res.body.signupId, properties: { profession: 'school_teacher', country: 'IN' }, createdAt: now }]);
  });
  it('200 welcome-back for a phone that already signed up (no duplicate row, no second event)', async () => {
    const { app, signups, webEvents } = make();
    const first = await request(app).post('/api/signup').send(valid);
    const again = await request(app).post('/api/signup').send({ ...valid, name: 'Different', phone: '+91 98765 43210', country: 'US' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ signupId: first.body.signupId, existing: true, join: JOIN });
    expect(await signups.listAll()).toHaveLength(1);
    expect(webEvents.rows).toHaveLength(1);
  });
  it('400 on a missing/invalid field with per-field messages', async () => {
    const { app } = make();
    const res = await request(app).post('/api/signup').send({ ...valid, name: 'M', profession: 'astronaut' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
    expect(Object.keys(res.body.fields)).toEqual(expect.arrayContaining(['name', 'profession']));
  });
  it('422 on a number that is not valid for the country', async () => {
    const { app, signups } = make();
    const res = await request(app).post('/api/signup').send({ ...valid, phone: '12345' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'invalid_phone' });
    expect(await signups.listAll()).toHaveLength(0);
  });
  it('400 and stores nothing when the honeypot field is filled', async () => {
    const { app, signups } = make();
    const res = await request(app).post('/api/signup').send({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(400);
    expect(await signups.listAll()).toHaveLength(0);
  });
  it('organization is optional and stored as null when blank', async () => {
    const { app, signups } = make();
    const res = await request(app).post('/api/signup').send({ ...valid, organization: '  ' });
    expect(res.status).toBe(201);
    expect((await signups.findById(res.body.signupId))?.organization).toBeNull();
  });
  it('429 after 20 signup attempts from one IP within 10 minutes', async () => {
    const { app } = make();
    for (let i = 0; i < 20; i++) expect((await request(app).post('/api/signup').send({})).status).toBe(400);
    const res = await request(app).post('/api/signup').send({});
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
  });
  it('400 (not 500) on malformed JSON and 413 on an oversized body', async () => {
    const { app } = make();
    const bad = await request(app).post('/api/signup').set('content-type', 'application/json').send('{"name": ');
    expect(bad.status).toBe(400);
    const big = await request(app).post('/api/signup').send({ ...valid, name: 'x'.repeat(20_000) });
    expect(big.status).toBe(413);
  });
});

describe('POST /api/events', () => {
  it('204 logs landing_view with the visitor id', async () => {
    const { app, webEvents } = make();
    const res = await request(app).post('/api/events').send({ visitorId: 'v-9', name: 'landing_view' });
    expect(res.status).toBe(204);
    expect(webEvents.rows).toEqual([{ visitorId: 'v-9', name: 'landing_view', signupId: null, properties: {}, createdAt: now }]);
  });
  it('join_tapped stamps the signup once and logs every tap', async () => {
    const { app, signups, webEvents } = make();
    const s = await signups.create({ name: 'M', profession: 'tutor', organization: null, phoneE164: '+919876543210', phoneRaw: 'x', city: 'Pune', country: 'IN', source: null, now });
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'join_tapped', signupId: s.id })).status).toBe(204);
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'join_tapped', signupId: s.id })).status).toBe(204);
    expect((await signups.findById(s.id))?.joinTappedAt).toEqual(now);
    expect(webEvents.names()).toEqual(['join_tapped', 'join_tapped']);
  });
  it('400 for join_tapped without a signupId, 404 for an unknown signupId, 400 for an unknown event name', async () => {
    const { app } = make();
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'join_tapped' })).status).toBe(400);
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'join_tapped', signupId: '11111111-1111-4111-8111-111111111111' })).status).toBe(404);
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'signup_submitted' })).status).toBe(400); // server-only event
  });
});

describe('GET /api/countries and API 404', () => {
  it('returns the country list with a day-long cache header', async () => {
    const { app } = make();
    const res = await request(app).get('/api/countries');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.body.countries).toEqual(expect.arrayContaining([{ code: 'IN', name: 'India', callingCode: '91' }]));
  });
  it('unknown /api paths return JSON 404 for any method', async () => {
    const { app } = make();
    expect((await request(app).get('/api/nope')).body).toEqual({ error: 'not_found' });
    expect((await request(app).post('/api/nope/deeper')).status).toBe(404);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test -- test/api.test.ts`
Expected: FAIL — `createApp` deps type errors / 404 HTML for `/api/signup`.

- [ ] **Step 5: Create `src/http/api.ts`**

```ts
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Clock, SignupRepo, WebEventLog } from '../ports.js';
import { DuplicateSignupError, PROFESSIONS, WEB_EVENT, type Signup } from '../domain/web.js';
import { normalizePhone } from '../domain/phone.js';
import { COUNTRY_OPTIONS } from '../domain/countries.js';

export interface JoinInfo {
  url: string;            // wa.me deep link with the join text pre-filled
  code: string;           // sandbox join words, e.g. "captain-cheese" (shown as the manual fallback)
  whatsappNumber: string; // "+14155238886"
}

export interface ApiDeps {
  signups: SignupRepo;
  webEvents: WebEventLog;
  clock: Clock;
  join: JoinInfo;
}

const SignupBody = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  profession: z.enum(PROFESSIONS, { error: 'Please pick one' }),
  organization: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(4, 'Please enter your WhatsApp number').max(32),
  city: z.string().trim().min(2, 'Please enter your city').max(80),
  country: z.string().trim().length(2, 'Please pick a country'),
  source: z.string().trim().max(64).optional(),
  visitorId: z.string().trim().max(64).optional(),
  website: z.string().optional(), // honeypot: real browsers never fill this (hidden field)
});

const EventBody = z.object({
  visitorId: z.string().trim().min(1).max(64),
  name: z.enum([WEB_EVENT.landing_view, WEB_EVENT.join_tapped]), // signup_submitted is logged server-side only
  signupId: z.uuid().optional(),
});

function signupResponse(s: Signup, join: JoinInfo, existing: boolean) {
  return { signupId: s.id, existing, join };
}

export function createApiRouter(deps: ApiDeps): express.Router {
  const router = express.Router();

  // Generous general limit: a staff room behind one NAT IP must not lock itself out (3 calls per visit).
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } }));
  // Tighter on the write that stores PII.
  const signupLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } });

  router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request', fields: z.flattenError(parsed.error).fieldErrors });
      return;
    }
    const b = parsed.data;
    if (b.website) {
      res.status(400).json({ error: 'bad_request' }); // honeypot tripped; say nothing useful to the bot
      return;
    }
    const phone = normalizePhone(b.phone, b.country);
    if ('error' in phone) {
      res.status(422).json({ error: 'invalid_phone' });
      return;
    }
    const now = deps.clock.now();
    const existing = await deps.signups.findByPhoneE164(phone.e164);
    if (existing) {
      res.status(200).json(signupResponse(existing, deps.join, true));
      return;
    }
    let signup: Signup;
    try {
      signup = await deps.signups.create({
        name: b.name,
        profession: b.profession,
        organization: b.organization ? b.organization : null,
        phoneE164: phone.e164,
        phoneRaw: b.phone,
        city: b.city,
        country: b.country.toUpperCase(),
        source: b.source ?? null,
        now,
      });
    } catch (err) {
      if (err instanceof DuplicateSignupError) {
        res.status(200).json(signupResponse(err.existing, deps.join, true)); // lost a race with a double-submit
        return;
      }
      throw err;
    }
    await deps.webEvents.log({ visitorId: b.visitorId ?? null, name: WEB_EVENT.signup_submitted, signupId: signup.id, properties: { profession: b.profession, country: signup.country } }, now);
    res.status(201).json(signupResponse(signup, deps.join, false));
  });

  router.post('/events', async (req: Request, res: Response) => {
    const parsed = EventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const { visitorId, name, signupId } = parsed.data;
    const now = deps.clock.now();
    if (name === WEB_EVENT.join_tapped) {
      if (!signupId) {
        res.status(400).json({ error: 'bad_request' });
        return;
      }
      if (!(await deps.signups.findById(signupId))) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      await deps.signups.markJoinTapped(signupId, now);
    }
    await deps.webEvents.log({ visitorId, name, signupId: signupId ?? null }, now);
    res.status(204).end();
  });

  router.get('/countries', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ countries: COUNTRY_OPTIONS });
  });

  return router;
}
```

- [ ] **Step 6: Wire it into `src/http/app.ts`**

Change the imports/deps:

```ts
import type { Clock, EventLog, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';
import { createApiRouter, type JoinInfo } from './api.js';

export interface AppDeps {
  config: Pick<Config, 'TWILIO_AUTH_TOKEN' | 'TWILIO_VALIDATE_SIGNATURE' | 'PUBLIC_BASE_URL' | 'ADMIN_TOKEN' | 'CRON_SECRET'>;
  handleInbound: (m: InboundMessage) => Promise<void>;
  runNudgePass: () => Promise<number>;
  teachers: TeacherRepo;
  events: EventLog;
  signups: SignupRepo;
  webEvents: WebEventLog;
  join: JoinInfo;
  webDist: string | null; // directory of the built SPA; null = API only (tests). Used from Task 5.
  clock: Clock;
}
```

Right after `app.use(express.urlencoded({ extended: false }));` add:

```ts
  // Order vs urlencoded is irrelevant: each parser only runs for its own Content-Type, so the
  // Twilio form webhook is untouched. 16kb is plenty for a sign-up form.
  app.use(express.json({ limit: '16kb' }));
```

After the `/internal/cron/nudges` route and BEFORE the error handler add:

```ts
  app.use('/api', createApiRouter({ signups: deps.signups, webEvents: deps.webEvents, clock: deps.clock, join: deps.join }));
  // JSON 404 for anything else under /api -- registered after the real routes. ('/api/*' throws in Express 5.)
  app.all('/api{/*splat}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });
```

Replace the error handler with a status-aware one (body-parser sends 400 `entity.parse.failed` / 413 `entity.too.large`):

```ts
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
    if (status >= 500) console.error('[http] error', err);
    if (!res.headersSent) res.status(status).json({ error: status >= 500 ? (err instanceof Error ? err.message : 'unknown') : 'bad_request' });
  });
```

- [ ] **Step 7: Wire `src/index.ts`**

Change the supabase import to include the new classes and build the join info:

```ts
import { createSupabase, SupabaseEventLog, SupabaseGenerationStore, SupabaseTeacherRepo, SupabasePapersRepo, SupabaseSignupRepo, SupabaseWebEventLog } from './adapters/supabase.js';
```

Replace the `createApp({...})` call with:

```ts
const app = createApp({
  config,
  handleInbound: createInboundHandler(deps),
  runNudgePass,
  teachers: deps.teachers,
  events: deps.events,
  signups: new SupabaseSignupRepo(sb),
  webEvents: new SupabaseWebEventLog(sb),
  join: { url: deps.joinLink, code: config.TWILIO_SANDBOX_JOIN_CODE, whatsappNumber: config.TWILIO_WHATSAPP_FROM.replace(/^whatsapp:/, '') },
  webDist: null, // Task 5 replaces this with WEB_DIST
  clock: deps.clock,
});
```

- [ ] **Step 8: Run all tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS (new `api.test.ts`: 13 tests — 8 signup + 3 events + 2 countries/404); tsc clean.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/http/api.ts src/http/app.ts src/index.ts test/api.test.ts test/app.test.ts
git commit -m "feat(api): /api/signup, /api/events, /api/countries with rate limits and JSON errors"
```

---

### Task 5: Serve the SPA from Express (static files + fallback + cache headers)

**Files:**
- Create: `src/http/static.ts`
- Create fixtures: `test/fixtures/web-dist/index.html`, `test/fixtures/web-dist/assets/app-abc123.js`, `test/fixtures/web-dist/sw.js`, `test/fixtures/web-dist/manifest.webmanifest`, `test/fixtures/web-dist/pwa-192x192.png`
- Modify: `src/http/app.ts`, `src/index.ts`
- Test: `test/static.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const WEB_DIST: string; // <repo>/web/dist, resolved relative to this module so it works from src/ (tsx) and dist/ (compiled)
  export function mountSpa(app: express.Express, dir: string): boolean; // false (and mounts nothing) when dir/index.html is missing
  ```

- [ ] **Step 1: Create the fixture files**

```bash
mkdir -p test/fixtures/web-dist/assets
printf '<!doctype html><html><head><title>fixture</title></head><body><div id="root"></div></body></html>\n' > test/fixtures/web-dist/index.html
printf 'console.log("fixture asset");\n' > test/fixtures/web-dist/assets/app-abc123.js
printf '// fixture sw\n' > test/fixtures/web-dist/sw.js
printf '{"name":"fixture"}\n' > test/fixtures/web-dist/manifest.webmanifest
printf 'not-really-a-png\n' > test/fixtures/web-dist/pwa-192x192.png
```

- [ ] **Step 2: Write the failing test**

```ts
// test/static.test.ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import express from 'express';
import { mountSpa, WEB_DIST } from '../src/http/static.js';
import { createApp, type AppDeps, WEBHOOK_PATH } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/web-dist', import.meta.url));

function deps(webDist: string | null): AppDeps {
  return {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: 'a', CRON_SECRET: 'c' },
    handleInbound: async () => {}, runNudgePass: async () => 0,
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(), signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(),
    join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' }, webDist, clock: new FixedClock(new Date('2026-08-23T10:00:00Z')),
  };
}

describe('mountSpa', () => {
  it('resolves WEB_DIST to <repo>/web/dist', () => {
    expect(WEB_DIST.replaceAll('\\', '/')).toMatch(/\/teachspark\/web\/dist$/);
  });
  it('returns false and mounts nothing when the build is missing', async () => {
    const app = express();
    expect(mountSpa(app, '/definitely/not/here')).toBe(false);
    expect((await request(app).get('/')).status).toBe(404);
  });
  it('serves index.html for / and client routes with no-cache, immutable for hashed assets, no-cache for sw/manifest', async () => {
    const app = createApp(deps(FIXTURE));
    for (const p of ['/', '/join', '/joined', '/deep/route?x=1']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('id="root"');
    }
    const asset = await request(app).get('/assets/app-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request(app).get('/sw.js')).headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/manifest.webmanifest')).headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/pwa-192x192.png')).headers['cache-control']).toBe('public, max-age=86400');
  });
  it('a missing file with an extension is a 404, not index.html', async () => {
    const res = await request(createApp(deps(FIXTURE))).get('/nope.png');
    expect(res.status).toBe(404);
  });
  it('backend routes still win over the SPA fallback', async () => {
    const app = createApp(deps(FIXTURE));
    expect((await request(app).get('/health')).body).toEqual({ ok: true });
    expect((await request(app).get('/admin/metrics')).status).toBe(401);
    expect((await request(app).get('/api/nope')).body).toEqual({ error: 'not_found' });
    const hook = await request(app).post(WEBHOOK_PATH).type('form').send({ From: 'whatsapp:+1', Body: 'hi', MessageSid: 'SM1' });
    expect(hook.status).toBe(200);
    expect(hook.text).toContain('<Response/>');
  });
  it('POST to an unknown non-API path is not answered with HTML 200', async () => {
    expect((await request(createApp(deps(FIXTURE))).post('/join')).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- test/static.test.ts`
Expected: FAIL — module `../src/http/static.js` not found.

- [ ] **Step 4: Create `src/http/static.ts`**

```ts
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

// src/http/ and dist/http/ are both exactly two levels below the repo root, so the same relative
// URL resolves to <repo>/web/dist under `tsx src/index.ts` and under `node dist/index.js`.
export const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const NO_CACHE = /(?:^|[\\/])(?:index\.html|sw\.js|workbox-[^\\/]+\.js|registerSW\.js|manifest\.webmanifest)$/;

/**
 * Serves the Vite build and falls back to index.html for client-side routes.
 * Must be called AFTER every API/webhook route (the fallback is a GET catch-all).
 * Returns false and mounts nothing when the build is absent, so API-only boots still work.
 */
export function mountSpa(app: express.Express, dir: string): boolean {
  const index = path.join(dir, 'index.html');
  if (!existsSync(index)) return false;

  app.use(
    express.static(dir, {
      index: false, // the fallback owns '/', so index.html always gets no-cache
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // content-hashed by Vite
        } else if (NO_CACHE.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache'); // revalidate via ETag; stale SW/manifest must not linger
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400'); // icons, og-cover.png, favicon
        }
      },
    }),
  );

  // Express 5 syntax: '/{*splat}' (braces) also matches bare '/'. GET only, so POSTs never get HTML.
  app.get('/{*splat}', (req, res, next) => {
    if (path.extname(req.path)) return next(); // a typo'd asset should 404, not render the app
    res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } });
  });
  return true;
}
```

- [ ] **Step 5: Mount it in `createApp`** (`src/http/app.ts`) — right after the `app.all('/api{/*splat}', …)` handler and before the error handler:

```ts
import { mountSpa } from './static.js';
// …
  if (deps.webDist && !mountSpa(app, deps.webDist)) {
    console.warn(`[http] SPA build not found at ${deps.webDist}; serving API only`);
  }
```

- [ ] **Step 6: Point `src/index.ts` at the real build**

```ts
import { WEB_DIST } from './http/static.js';
// in createApp({...}):
  webDist: WEB_DIST,
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all PASS (static: 6 tests); tsc clean.

- [ ] **Step 8: Commit**

```bash
git add src/http/static.ts src/http/app.ts src/index.ts test/static.test.ts test/fixtures
git commit -m "feat(api): serve the SPA build with cache headers and an Express 5 fallback"
```

---

### Task 6: `web/` workspace bring-up (Vite + React + vitest projects)

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/vite-env.d.ts`, `web/test/setup.ts`, `web/test/App.test.tsx`, `.nvmrc`
- Modify: root `package.json`, root `vitest.config.ts`, `.gitignore`
- Regenerate: `package-lock.json`

**Interfaces:**
- Produces: a working `npm run build` (web then api), `npm test` running both vitest projects, `npm run dev:web` (Vite on :5173 proxying `/api` to :3000).

- [ ] **Step 1: Root `package.json` changes**

Add `"workspaces": ["web"]`, set `"engines": { "node": ">=24.15" }`, and replace `scripts` with:

```json
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=.env src/index.ts",
    "dev:web": "npm run dev -w web",
    "build": "npm run build -w web && tsc -p tsconfig.build.json",
    "build:web": "npm run build -w web",
    "build:api": "tsc -p tsconfig.build.json",
    "start": "node --env-file-if-exists=.env dist/index.js",
    "typecheck": "tsc -p tsconfig.json && npm run typecheck -w web",
    "test": "vitest run",
    "test:api": "vitest run --project api",
    "test:web": "vitest run --project web",
    "test:watch": "vitest",
    "try:generate": "tsx --env-file-if-exists=.env scripts/try-generate.ts",
    "try:paper": "tsx --env-file-if-exists=.env scripts/try-paper.ts",
    "try:render": "tsx scripts/try-render.ts",
    "export:events": "tsx --env-file-if-exists=.env scripts/export-events.ts"
  },
```

- [ ] **Step 2: Create `web/package.json`**

```json
{
  "name": "@teachspark/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router": "^8.3.0"
  },
  "devDependencies": {
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.5",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.1.0",
    "jsdom": "^30.0.1",
    "typescript": "^7.0.2",
    "vite": "^8.2.2",
    "vite-plugin-pwa": "^1.3.0",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "types": ["vite/client", "vite-plugin-pwa/client", "@testing-library/jest-dom/vitest"]
  },
  "include": ["src", "test", "vite.config.ts", "vitest.config.ts", "pwa.routes.ts"]
}
```

- [ ] **Step 4: Create `web/vite.config.ts`** (PWA plugin is added in Task 14; `%PUBLIC_BASE_URL%` is used by Task 13)

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The repo root holds the single .env (PUBLIC_BASE_URL lives there for Twilio already).
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  // process env (Railway build) wins over .env files, same as Vite's own precedence
  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? loadEnv(mode, ROOT, 'PUBLIC_BASE_URL').PUBLIC_BASE_URL;
  if (mode === 'production' && !publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL must be set at build time (absolute https URL, no trailing slash): og:url/og:image are baked into index.html');
  }
  return {
    plugins: [react()],
    envDir: ROOT,
    // Exposes VITE_* and exactly PUBLIC_BASE_URL (prefix match == full name) to import.meta.env and
    // to %PUBLIC_BASE_URL% replacement in index.html. Everything else in .env stays server-only.
    envPrefix: ['VITE_', 'PUBLIC_BASE_URL'],
    server: {
      port: 5173,
      proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
```

- [ ] **Step 5: Create `web/vitest.config.ts` and `web/test/setup.ts`**

```ts
// web/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true, // Testing Library's auto-cleanup hooks into a global afterEach
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
```

```ts
// web/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Replace root `vitest.config.ts` with a projects config**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/**/*.ts'] }, // not allowed inside a project: stays at root
    projects: [
      {
        test: {
          name: 'api',
          root: '.',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          testTimeout: 15_000,
        },
      },
      'web/vitest.config.ts',
    ],
  },
});
```

- [ ] **Step 7: Create the minimal app**

```html
<!-- web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0a0a0a" />
    <title>TeachSpark — worksheets for your class, on WhatsApp</title>
    <meta name="description" content="TeachSpark writes a ready-to-use, 3-level worksheet for your own class in about 2 minutes — on WhatsApp. Free pilot for teachers." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// web/src/vite-env.d.ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly PUBLIC_BASE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

```tsx
// web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

```tsx
// web/src/App.tsx  (placeholder routes; Tasks 10-12 replace the elements)
import { Route, Routes } from 'react-router';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<h1>TeachSpark</h1>} />
      <Route path="*" element={<h1>TeachSpark</h1>} />
    </Routes>
  );
}
```

```tsx
// web/test/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.tsx';

describe('App', () => {
  it('renders the brand on /', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'TeachSpark' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: `.nvmrc` and `.gitignore`**

```bash
echo 24 > .nvmrc
printf 'web/dev-dist/\n' >> .gitignore
```
(`dist/` in `.gitignore` already covers `web/dist/`.)

- [ ] **Step 9: Install, regenerate the lockfile, and prove the Railway build path**

```bash
npm install                      # regenerates the single root package-lock.json with the workspace
rm -rf node_modules && npm ci    # exactly what Railway runs; fails with EUSAGE if the lock is out of sync
PUBLIC_BASE_URL=https://example.test npm run build
ls web/dist/index.html dist/index.js
npm test
npm run typecheck
```
Expected: `npm ci` exits 0 (no `web/node_modules`, no `web/package-lock.json` created); both `web/dist/index.html` and `dist/index.js` exist; vitest prints both projects (`|api|` and `|web|`) all green; tsc clean for both.

Also confirm the server picks the build up: `npm run build && node -e "import('./dist/http/static.js').then(m=>console.log(m.WEB_DIST))"` prints `<repo>/web/dist`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .nvmrc .gitignore web/package.json web/tsconfig.json web/vite.config.ts web/vitest.config.ts web/index.html web/src web/test
git commit -m "feat(web): Vite + React workspace with jsdom vitest project"
```

---

### Task 7: Design system, Nav, and the neon sign-up CTA

**Files:**
- Create: `web/src/styles/tokens.css`, `web/src/styles/global.css`, `web/src/components/NeonButton.tsx`, `web/src/components/NeonButton.css`, `web/src/components/Nav.tsx`, `web/src/lib/nav.ts`
- Modify: `web/index.html` (fonts), `web/src/main.tsx` (import global css), `web/src/App.tsx` (shell + Nav)
- Test: `web/test/nav.test.ts`, `web/test/Nav.test.tsx`, `web/test/NeonButton.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // web/src/lib/nav.ts
  export function showSignupCta(pathname: string): boolean; // false on /join, /joined, /admin*
  // web/src/components/NeonButton.tsx
  export type NeonButtonProps = { children: ReactNode; size?: 'md' | 'lg'; className?: string; onClick?: () => void } & ({ to: string; href?: never } | { href: string; to?: never });
  export function NeonButton(props: NeonButtonProps): JSX.Element; // <Link> for `to`, <a target=_blank rel=noopener> for `href`
  // web/src/components/Nav.tsx
  export function Nav(props: { showSignup: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// web/test/nav.test.ts
import { describe, it, expect } from 'vitest';
import { showSignupCta } from '../src/lib/nav.ts';

describe('showSignupCta', () => {
  it('shows the CTA on marketing surfaces only', () => {
    expect(showSignupCta('/')).toBe(true);
    expect(showSignupCta('/anything-else')).toBe(true);
    expect(showSignupCta('/join')).toBe(false);
    expect(showSignupCta('/joined')).toBe(false);
    expect(showSignupCta('/admin')).toBe(false);
    expect(showSignupCta('/admin/metrics')).toBe(false);
  });
});
```

```tsx
// web/test/Nav.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Nav } from '../src/components/Nav.tsx';

describe('Nav', () => {
  it('renders the brand, the pill links, and the neon sign-up CTA pointing at /join', () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'TeachSpark' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveClass('neon-btn');
    expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how');
  });
  it('hides the CTA when showSignup is false', () => {
    render(<MemoryRouter><Nav showSignup={false} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Sign up' })).toBeNull();
  });
  it('toggles the mobile menu', async () => {
    render(<MemoryRouter><Nav showSignup /></MemoryRouter>);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation')).toHaveClass('nav--open');
  });
});
```

```tsx
// web/test/NeonButton.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NeonButton } from '../src/components/NeonButton.tsx';

describe('NeonButton', () => {
  it('renders an internal link for `to`', () => {
    render(<MemoryRouter><NeonButton to="/join">Sign up</NeonButton></MemoryRouter>);
    const a = screen.getByRole('link', { name: 'Sign up' });
    expect(a).toHaveAttribute('href', '/join');
    expect(a).toHaveClass('neon-btn', 'neon-btn--md');
    expect(a).not.toHaveAttribute('target');
  });
  it('renders an external anchor opening a new tab for `href`', () => {
    render(<NeonButton href="https://wa.me/1?text=join" size="lg">Open WhatsApp</NeonButton>);
    const a = screen.getByRole('link', { name: 'Open WhatsApp' });
    expect(a).toHaveAttribute('href', 'https://wa.me/1?text=join');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(a).toHaveClass('neon-btn--lg');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — modules not found.

- [ ] **Step 3: Tokens and global styles**

```css
/* web/src/styles/tokens.css */
:root {
  --bg: #0a0a0a;
  --bg-elev: #141414;
  --bg-card: #181818;
  --border: #262626;
  --text: #f5f5f5;
  --muted: #a3a3a3;
  --lime: #b6ff3b;
  --lime-ink: #0a0a0a;
  --green: #169a3c;
  --danger: #ff6b6b;
  --radius: 20px;
  --pill: 999px;
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --shell-max: 1200px;
  --gutter: clamp(16px, 4vw, 48px);
  color-scheme: dark;
}
```

```css
/* web/src/styles/global.css */
@import './tokens.css';

*, *::before, *::after { box-sizing: border-box; }
html, body, #root { min-height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden; /* the orb glow may bleed past the viewport on small screens */
}
a { color: inherit; }
button, input, select { font: inherit; }
:focus-visible { outline: 2px solid var(--lime); outline-offset: 3px; }

.shell { max-width: var(--shell-max); margin: 0 auto; padding: 0 var(--gutter); }

/* Nav */
.nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 20px 0; position: relative; }
.nav__brand { font-weight: 700; font-size: 1.25rem; text-decoration: none; letter-spacing: -0.01em; }
.nav__pills { display: flex; gap: 4px; padding: 4px; border-radius: var(--pill); background: var(--bg-elev); border: 1px solid var(--border); list-style: none; margin: 0; }
.nav__pill { padding: 10px 22px; border-radius: var(--pill); text-decoration: none; color: var(--text); font-weight: 500; font-size: 0.95rem; }
.nav__pill[aria-current='page'] { background: var(--lime); color: var(--lime-ink); font-weight: 700; }
.nav__cta { justify-self: end; display: flex; align-items: center; gap: 12px; }
.nav__toggle { display: none; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); }

/* Hero */
.hero { display: grid; grid-template-columns: 1.1fr 0.9fr; align-items: center; gap: 32px; min-height: calc(100svh - 96px); padding: 24px 0 48px; }
.hero__eyebrow { color: var(--muted); font-size: 1.1rem; max-width: 24ch; line-height: 1.45; margin: 0 0 20px; }
.hero__title { font-size: clamp(2.6rem, 9vw, 7.5rem); line-height: 0.95; letter-spacing: -0.03em; margin: 24px 0 0; }
.hero__title strong { font-weight: 800; display: block; }
.hero__title span { font-weight: 300; display: block; }
.hero__actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 28px; }
.hero__orb { justify-self: center; width: min(100%, 460px); }

/* Sections */
.section { padding: 56px 0; border-top: 1px solid var(--border); }
.section h2 { font-size: clamp(1.6rem, 3.5vw, 2.4rem); letter-spacing: -0.02em; margin: 0 0 24px; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
.card h3 { margin: 0 0 8px; font-size: 1.1rem; }
.card p { margin: 0; color: var(--muted); line-height: 1.5; }
.card__num { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--lime); color: var(--lime-ink); font-weight: 800; margin-bottom: 14px; }

/* Forms */
.form { max-width: 560px; margin: 0 auto; padding: 24px 0 64px; }
.form h1 { font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -0.02em; margin: 0 0 8px; }
.form__lead { color: var(--muted); margin: 0 0 28px; line-height: 1.5; }
.field { display: grid; gap: 6px; margin-bottom: 18px; }
.field label { font-weight: 600; font-size: 0.95rem; }
.field input, .field select { width: 100%; min-height: 48px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); }
.field input:focus, .field select:focus { border-color: var(--lime); outline: none; }
.field--error input, .field--error select { border-color: var(--danger); }
.field__error { color: var(--danger); font-size: 0.875rem; }
.phone { display: grid; grid-template-columns: auto 1fr; gap: 8px; }
.phone__cc { display: grid; place-items: center; min-width: 64px; padding: 0 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--muted); }
.consent { color: var(--muted); font-size: 0.875rem; line-height: 1.5; margin: 8px 0 20px; }
.banner { border-radius: 14px; padding: 12px 14px; margin-bottom: 18px; background: #2a1414; border: 1px solid #5a2323; color: #ffb4b4; }
.hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.btn-submit { width: 100%; min-height: 52px; border-radius: var(--pill); border: 0; background: var(--lime); color: var(--lime-ink); font-weight: 800; font-size: 1.05rem; cursor: pointer; }
.btn-submit[disabled] { opacity: 0.6; cursor: progress; }

/* Joined */
.joined { text-align: center; max-width: 640px; margin: 0 auto; padding: 16px 0 64px; }
.joined h1 { font-size: clamp(2rem, 6vw, 3.5rem); letter-spacing: -0.02em; margin: 16px 0 8px; }
.joined__lead { color: var(--muted); margin: 0 0 28px; line-height: 1.5; }
.steps { text-align: left; display: grid; gap: 12px; margin: 28px auto 0; padding: 0; list-style: none; max-width: 460px; }
.steps li { display: grid; grid-template-columns: 32px 1fr; gap: 12px; align-items: start; }
.steps code, .joined code { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px; padding: 2px 8px; }
.joined__fallback { color: var(--muted); font-size: 0.9rem; margin-top: 28px; line-height: 1.6; }

/* Responsive */
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; min-height: auto; text-align: center; }
  .hero__orb { order: -1; width: min(70vw, 320px); }
  .hero__eyebrow { max-width: none; margin-inline: auto; }
  .hero__actions { justify-content: center; }
  .cards { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .nav { grid-template-columns: auto 1fr auto; }
  .nav__pills { display: none; position: absolute; top: 76px; left: 0; right: 0; flex-direction: column; z-index: 20; }
  .nav--open .nav__pills { display: flex; }
  .nav__pill { padding: 14px 20px; }
  .nav__toggle { display: inline-grid; place-items: center; }
  .nav__cta .neon-btn { padding: 10px 16px; font-size: 0.9rem; }
}
@media (max-width: 480px) {
  .hero__title { font-size: clamp(2.4rem, 14vw, 3.6rem); }
  .phone { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: NeonButton**

```css
/* web/src/components/NeonButton.css */
@property --neon-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }

.neon-btn {
  position: relative; isolation: isolate;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 26px; border-radius: var(--pill);
  background: var(--bg-elev); color: var(--lime);
  font-weight: 700; text-decoration: none; white-space: nowrap;
  transition: transform 0.15s ease;
}
.neon-btn--lg { padding: 18px 34px; font-size: 1.15rem; }
.neon-btn:hover { transform: translateY(-1px); }
.neon-btn:active { transform: translateY(0); }

/* Traveling light: a conic gradient spun by an animated custom property, masked down to a 2px ring. */
.neon-btn::before {
  content: ''; position: absolute; inset: -2px; z-index: -1; border-radius: inherit; padding: 2px;
  background: conic-gradient(from var(--neon-angle), transparent 0 55%, var(--lime) 78%, #eaffc2 88%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: neon-spin 2.8s linear infinite;
}
/* Soft bloom behind the ring. */
.neon-btn::after {
  content: ''; position: absolute; inset: -8px; z-index: -2; border-radius: inherit;
  background: conic-gradient(from var(--neon-angle), transparent 0 55%, var(--lime) 85%, transparent 100%);
  filter: blur(14px); opacity: 0.5;
  animation: neon-spin 2.8s linear infinite, neon-pulse 2.4s ease-in-out infinite;
}
.neon-btn:hover::before, .neon-btn:hover::after { animation-duration: 1.3s, 1.2s; }
.neon-btn:hover::after { opacity: 0.9; }

@keyframes neon-spin { to { --neon-angle: 360deg; } }
@keyframes neon-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.75; } }

@media (prefers-reduced-motion: reduce) {
  .neon-btn::before, .neon-btn::after { animation: none; }
  .neon-btn::before { background: var(--lime); }         /* static lime ring */
  .neon-btn::after { background: var(--lime); opacity: 0.35; } /* static glow */
  .neon-btn:hover { transform: none; }
}
```

```tsx
// web/src/components/NeonButton.tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './NeonButton.css';

type Common = { children: ReactNode; size?: 'md' | 'lg'; className?: string; onClick?: () => void };
export type NeonButtonProps = Common & ({ to: string; href?: never } | { href: string; to?: never });

/** The sign-up/join CTA: lime text on dark, with a spinning neon border + bloom (CSS only). */
export function NeonButton({ children, size = 'md', className, onClick, ...target }: NeonButtonProps) {
  const cls = ['neon-btn', `neon-btn--${size}`, className].filter(Boolean).join(' ');
  if ('href' in target && target.href !== undefined) {
    return (
      <a className={cls} href={target.href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        <span className="neon-btn__label">{children}</span>
      </a>
    );
  }
  return (
    <Link className={cls} to={target.to as string} onClick={onClick}>
      <span className="neon-btn__label">{children}</span>
    </Link>
  );
}
```

- [ ] **Step 5: Nav + `showSignupCta`**

```ts
// web/src/lib/nav.ts
/** The persistent sign-up CTA appears wherever a teacher has not yet signed up. */
export function showSignupCta(pathname: string): boolean {
  if (pathname === '/join' || pathname === '/joined') return false;
  if (pathname.startsWith('/admin')) return false;
  return true;
}
```

```tsx
// web/src/components/Nav.tsx
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { NeonButton } from './NeonButton.tsx';

// Only Home is a NavLink: NavLink's active check ignores the hash, so '/#how' would also light up on '/'.
const ANCHORS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#why', label: 'Why teachers use it' },
];

export function Nav({ showSignup }: { showSignup: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <nav className={`nav${open ? ' nav--open' : ''}`} aria-label="Main">
      <button type="button" className="nav__toggle" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{open ? '×' : '☰'}</span>
      </button>
      <Link to="/" className="nav__brand">TeachSpark</Link>
      <ul className="nav__pills">
        <li><NavLink to="/" end className="nav__pill" onClick={close}>Home</NavLink></li>
        {ANCHORS.map((l) => (
          <li key={l.to}><Link to={l.to} className="nav__pill" onClick={close}>{l.label}</Link></li>
        ))}
      </ul>
      <div className="nav__cta">{showSignup && <NeonButton to="/join">Sign up</NeonButton>}</div>
    </nav>
  );
}
```

- [ ] **Step 6: Shell in `App.tsx`, fonts in `index.html`, css import in `main.tsx`**

```tsx
// web/src/App.tsx
import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { showSignupCta } from './lib/nav.ts';

export function App() {
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <Nav showSignup={showSignupCta(pathname)} />
      <Routes>
        <Route path="/" element={<h1>TeachSpark</h1>} />
        <Route path="*" element={<h1>TeachSpark</h1>} />
      </Routes>
    </div>
  );
}
```
(`App.test.tsx` from Task 6 must still pass — the `<h1>` stays until Task 10. The Nav brand is a *link*, not a heading, so `getByRole('heading', { name: 'TeachSpark' })` remains unique.)

Add to `web/index.html` `<head>`, after the description meta:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700;800&display=swap" rel="stylesheet" />
```

In `web/src/main.tsx` add as the first import: `import './styles/global.css';`

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (nav: 1, Nav: 3, NeonButton: 2, App: 1); tsc clean.

- [ ] **Step 8: Visual smoke check**

Run: `npm run dev:web` and open http://localhost:5173 — the nav shows pill links with Home highlighted, and a "Sign up" button with a lime light chasing around its border. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add web/index.html web/src web/test
git commit -m "feat(web): design tokens, nav with mobile menu, neon sign-up CTA"
```

---

### Task 8: Spark — the orb with cursor-tracking, expressive eyes

**Files:**
- Create: `web/src/components/spark/eyes.ts`, `web/src/components/spark/Spark.tsx`, `web/src/components/spark/Spark.css`
- Test: `web/test/eyes.test.ts`, `web/test/Spark.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // eyes.ts (pure)
  export interface Point { x: number; y: number }
  export type EyeState = 'default' | 'puppy' | 'starry' | 'blink' | 'happy';
  export type Mood = Exclude<EyeState, 'blink'>;
  export function eyeOffset(eye: Point, pointer: Point | null, maxOffset: number, reach?: number): Point;
  export function orbTilt(center: Point, pointer: Point | null, maxDeg: number, reach?: number): { rx: number; ry: number };
  export function lerp(a: number, b: number, t: number): number;
  export function clamp(v: number, lo: number, hi: number): number;
  export function starPath(cx: number, cy: number, outerR: number, innerR: number, points?: number): string;
  export function resolveEyeState(input: { mood: Mood; hovered: boolean; blinking: boolean }): EyeState;
  export function idlePointer(tMs: number, center: Point): Point; // slow Lissajous drift for touch devices
  // Spark.tsx
  export function Spark(props: { mood?: Mood; size?: number; blinkEveryMs?: number; className?: string }): JSX.Element;
  // root element carries data-state={EyeState}; eyes follow the pointer on hover-capable devices,
  // drift idly on touch devices, freeze (blinks only) under prefers-reduced-motion.
  ```

- [ ] **Step 1: Write the failing pure-math tests**

```ts
// web/test/eyes.test.ts
import { describe, it, expect } from 'vitest';
import { clamp, eyeOffset, idlePointer, lerp, orbTilt, resolveEyeState, starPath } from '../src/components/spark/eyes.ts';

describe('eyeOffset', () => {
  const eye = { x: 100, y: 100 };
  it('is zero with no pointer or a pointer on the eye', () => {
    expect(eyeOffset(eye, null, 14)).toEqual({ x: 0, y: 0 });
    expect(eyeOffset(eye, { x: 100, y: 100 }, 14)).toEqual({ x: 0, y: 0 });
  });
  it('points toward the pointer and saturates at maxOffset', () => {
    const far = eyeOffset(eye, { x: 1000, y: 100 }, 14);
    expect(far.x).toBeCloseTo(14);
    expect(far.y).toBeCloseTo(0);
    const up = eyeOffset(eye, { x: 100, y: -1000 }, 14);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-14);
  });
  it('scales smoothly inside the reach', () => {
    const near = eyeOffset(eye, { x: 160, y: 100 }, 14, 240); // 60/240 of the way
    expect(near.x).toBeCloseTo(3.5);
  });
});

describe('orbTilt', () => {
  it('tilts toward the pointer, clamped to maxDeg, inverted on the x axis', () => {
    const c = { x: 0, y: 0 };
    expect(orbTilt(c, null, 8)).toEqual({ rx: 0, ry: 0 });
    const right = orbTilt(c, { x: 10_000, y: 0 }, 8);
    expect(right.rx).toBeCloseTo(0);
    expect(right.ry).toBeCloseTo(8);
    const down = orbTilt(c, { x: 0, y: 10_000 }, 8);
    expect(down.rx).toBeCloseTo(-8);
    expect(down.ry).toBeCloseTo(0);
    expect(orbTilt(c, { x: 300, y: 0 }, 8, 600).ry).toBeCloseTo(4);
  });
});

describe('helpers', () => {
  it('lerp and clamp', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it('starPath builds a closed 5-point star', () => {
    const d = starPath(0, 0, 10, 4);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L')).toHaveLength(10); // 10 vertices: M + 9 L
  });
  it('idlePointer stays within the orb and moves over time', () => {
    const c = { x: 200, y: 190 };
    const a = idlePointer(0, c);
    const b = idlePointer(1500, c);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(200);
    expect(a).not.toEqual(b);
  });
});

describe('resolveEyeState', () => {
  it('blink beats everything, hover gives puppy only on default mood, mood otherwise', () => {
    expect(resolveEyeState({ mood: 'starry', hovered: true, blinking: true })).toBe('blink');
    expect(resolveEyeState({ mood: 'default', hovered: true, blinking: false })).toBe('puppy');
    expect(resolveEyeState({ mood: 'starry', hovered: true, blinking: false })).toBe('starry');
    expect(resolveEyeState({ mood: 'happy', hovered: false, blinking: false })).toBe('happy');
    expect(resolveEyeState({ mood: 'default', hovered: false, blinking: false })).toBe('default');
  });
});
```

- [ ] **Step 2: Write the failing component test**

```tsx
// web/test/Spark.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Spark } from '../src/components/spark/Spark.tsx';

afterEach(() => vi.useRealTimers());

describe('Spark', () => {
  it('renders an accessible orb in the default state with both eyes', () => {
    render(<Spark />);
    const orb = screen.getByRole('img', { name: /Spark/ });
    expect(orb.closest('[data-state]')).toHaveAttribute('data-state', 'default');
    expect(orb.querySelectorAll('[data-eye]')).toHaveLength(2);
  });
  it('reflects the mood prop', () => {
    const { container } = render(<Spark mood="starry" />);
    expect(container.firstElementChild).toHaveAttribute('data-state', 'starry');
  });
  it('goes puppy-eyed on hover and back on leave', async () => {
    const user = userEvent.setup();
    const { container } = render(<Spark />);
    const root = container.firstElementChild as HTMLElement;
    await user.hover(root);
    expect(root).toHaveAttribute('data-state', 'puppy');
    await user.unhover(root);
    expect(root).toHaveAttribute('data-state', 'default');
  });
  it('blinks on the configured cadence', () => {
    vi.useFakeTimers();
    const { container } = render(<Spark blinkEveryMs={1000} />);
    const root = container.firstElementChild as HTMLElement;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(root).toHaveAttribute('data-state', 'blink');
    act(() => { vi.advanceTimersByTime(200); });
    expect(root).toHaveAttribute('data-state', 'default');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create `eyes.ts`**

```ts
// Pure geometry for Spark's eyes. No DOM here so it is trivially testable.
export interface Point { x: number; y: number }
export type EyeState = 'default' | 'puppy' | 'starry' | 'blink' | 'happy';
export type Mood = Exclude<EyeState, 'blink'>;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Vector from the eye toward the pointer, scaled so it saturates at maxOffset once the pointer is `reach` away. */
export function eyeOffset(eye: Point, pointer: Point | null, maxOffset: number, reach = 240): Point {
  if (!pointer) return { x: 0, y: 0 };
  const dx = pointer.x - eye.x;
  const dy = pointer.y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  const k = Math.min(1, dist / reach) * maxOffset;
  return { x: (dx / dist) * k, y: (dy / dist) * k };
}

/** Small parallax tilt of the whole orb toward the pointer (degrees for rotateX/rotateY). */
export function orbTilt(center: Point, pointer: Point | null, maxDeg: number, reach = 600): { rx: number; ry: number } {
  if (!pointer) return { rx: 0, ry: 0 };
  const nx = clamp((pointer.x - center.x) / reach, -1, 1);
  const ny = clamp((pointer.y - center.y) / reach, -1, 1);
  return { rx: -ny * maxDeg, ry: nx * maxDeg };
}

export function starPath(cx: number, cy: number, outerR: number, innerR: number, points = 5): string {
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + i * step;
    const x = (cx + Math.cos(a) * r).toFixed(2);
    const y = (cy + Math.sin(a) * r).toFixed(2);
    d += (i === 0 ? 'M' : 'L') + `${x} ${y}`;
  }
  return d + 'Z';
}

/** Blink overrides everything; hover = puppy eyes, but only when nothing more specific is going on. */
export function resolveEyeState({ mood, hovered, blinking }: { mood: Mood; hovered: boolean; blinking: boolean }): EyeState {
  if (blinking) return 'blink';
  if (hovered && mood === 'default') return 'puppy';
  return mood;
}

/** Where a touch-device Spark "looks": a slow Lissajous wander around the orb. */
export function idlePointer(tMs: number, center: Point): Point {
  return { x: center.x + 150 * Math.sin(tMs / 1900), y: center.y + 90 * Math.cos(tMs / 2300) };
}
```

- [ ] **Step 5: Create `Spark.css`**

```css
/* web/src/components/spark/Spark.css */
.spark { display: block; width: 100%; perspective: 900px; }
.spark__svg { display: block; width: 100%; height: auto; overflow: visible; transform-style: preserve-3d; will-change: transform; }
.spark__eyes { will-change: transform; }
.spark__eye-shape { opacity: 0; transition: opacity 0.18s ease; }
.spark[data-state='default'] .spark__eye-shape--default,
.spark[data-state='puppy']   .spark__eye-shape--puppy,
.spark[data-state='starry']  .spark__eye-shape--starry,
.spark[data-state='blink']   .spark__eye-shape--blink,
.spark[data-state='happy']   .spark__eye-shape--happy { opacity: 1; }
.spark[data-state='blink'] .spark__eye-shape { transition-duration: 0.06s; }
.spark__eye-shape--starry { transform-box: fill-box; transform-origin: center; animation: spark-twinkle 1.1s ease-in-out infinite; }
@keyframes spark-twinkle { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.12) rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .spark__eye-shape--starry { animation: none; } }
```

- [ ] **Step 6: Create `Spark.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { eyeOffset, idlePointer, lerp, orbTilt, resolveEyeState, starPath, type Mood, type Point } from './eyes.ts';
import './Spark.css';

// Geometry in SVG user units (viewBox 0 0 400 400).
const VB = 400;
const CENTER: Point = { x: 200, y: 190 };
const EYES: Point[] = [{ x: 160, y: 182 }, { x: 240, y: 182 }];
const MAX_EYE_OFFSET = 14;
const MAX_TILT_DEG = 7;

export interface SparkProps {
  mood?: Mood;         // driven by the page: 'starry' on /joined or CTA hover, 'happy' after submit
  size?: number;       // CSS max width in px; the SVG scales to its container
  blinkEveryMs?: number; // fixed cadence (tests); default = random 3–6s
  className?: string;
}

function Eye({ cx, cy, side }: { cx: number; cy: number; side: 'left' | 'right' }) {
  const tilt = side === 'left' ? -6 : 6;
  return (
    <g data-eye={side}>
      <rect className="spark__eye-shape spark__eye-shape--default" x={cx - 18} y={cy - 31} width={36} height={62} rx={16} fill="#fff" />
      <g className="spark__eye-shape spark__eye-shape--puppy" transform={`rotate(${tilt} ${cx} ${cy})`}>
        <rect x={cx - 23} y={cy - 38} width={46} height={76} rx={22} fill="#fff" />
        <circle cx={cx - 8} cy={cy - 20} r={6} fill="#b6ff3b" />
      </g>
      <path className="spark__eye-shape spark__eye-shape--starry" d={starPath(cx, cy, 34, 14)} fill="#fff" />
      <rect className="spark__eye-shape spark__eye-shape--blink" x={cx - 20} y={cy - 3} width={40} height={6} rx={3} fill="#fff" />
      <path className="spark__eye-shape spark__eye-shape--happy" d={`M ${cx - 22} ${cy + 8} Q ${cx} ${cy - 24} ${cx + 22} ${cy + 8}`} stroke="#fff" strokeWidth={9} strokeLinecap="round" fill="none" />
    </g>
  );
}

export function Spark({ mood = 'default', size = 460, blinkEveryMs, className }: SparkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [hovered, setHovered] = useState(false);
  const [blinking, setBlinking] = useState(false);

  // Blink: a short squash on a loose cadence.
  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout>;
    let openTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const wait = blinkEveryMs ?? 3000 + Math.random() * 3000;
      closeTimer = setTimeout(() => {
        setBlinking(true);
        openTimer = setTimeout(() => { setBlinking(false); schedule(); }, 140);
      }, wait);
    };
    schedule();
    return () => { clearTimeout(closeTimer); clearTimeout(openTimer); };
  }, [blinkEveryMs]);

  // Gaze: follow the pointer (hover devices) or wander (touch). Eased every frame, written straight
  // to the DOM so tracking never re-renders React.
  useEffect(() => {
    const svg = svgRef.current;
    const eyes = eyesRef.current;
    if (!svg || !eyes || typeof window.matchMedia !== 'function') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // blinks only
    const canHover = window.matchMedia('(hover: hover)').matches;

    let target: Point | null = null;
    const current = { ex: 0, ey: 0, rx: 0, ry: 0 };
    let raf = 0;
    const start = performance.now();

    const toSvg = (clientX: number, clientY: number): Point => {
      const r = svg.getBoundingClientRect();
      const s = r.width / VB || 1;
      return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
    };
    const onMove = (e: PointerEvent) => { target = toSvg(e.clientX, e.clientY); };
    const onLeave = () => { target = null; };
    if (canHover) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave); // cursor left the window: relax the gaze
    }

    const tick = (now: number) => {
      const p = canHover ? target : idlePointer(now - start, CENTER);
      // Both eyes share one offset (computed from the midpoint) so they never cross.
      const mid = { x: (EYES[0]!.x + EYES[1]!.x) / 2, y: EYES[0]!.y };
      const o = eyeOffset(mid, p, MAX_EYE_OFFSET);
      const t = orbTilt(CENTER, p, MAX_TILT_DEG);
      current.ex = lerp(current.ex, o.x, 0.18);
      current.ey = lerp(current.ey, o.y, 0.18);
      current.rx = lerp(current.rx, t.rx, 0.12);
      current.ry = lerp(current.ry, t.ry, 0.12);
      eyes.setAttribute('transform', `translate(${current.ex.toFixed(2)} ${current.ey.toFixed(2)})`);
      svg.style.transform = `rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  const state = resolveEyeState({ mood, hovered, blinking });
  return (
    <div className={['spark', className].filter(Boolean).join(' ')} style={{ maxWidth: size }} data-state={state}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <svg ref={svgRef} className="spark__svg" viewBox={`0 0 ${VB} ${VB}`} role="img" aria-label="Spark, the TeachSpark mascot — a green orb with big eyes that follow your cursor">
        <defs>
          <radialGradient id="spark-body" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#2fd65f" />
            <stop offset="45%" stopColor="#169a3c" />
            <stop offset="100%" stopColor="#062b14" />
          </radialGradient>
          <radialGradient id="spark-gloss" cx="30%" cy="22%" r="45%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="spark-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1f8a3a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="spark-blur" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
        </defs>
        <ellipse cx="200" cy="372" rx="120" ry="16" fill="url(#spark-shadow)" filter="url(#spark-blur)" />
        <circle cx={CENTER.x} cy={CENTER.y} r="150" fill="url(#spark-body)" />
        <ellipse cx="150" cy="110" rx="70" ry="48" fill="url(#spark-gloss)" />
        <g ref={eyesRef} className="spark__eyes">
          <Eye cx={EYES[0]!.x} cy={EYES[0]!.y} side="left" />
          <Eye cx={EYES[1]!.x} cy={EYES[1]!.y} side="right" />
        </g>
      </svg>
    </div>
  );
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (eyes: 8, Spark: 4); tsc clean. (jsdom has `matchMedia` undefined — the effect's `typeof window.matchMedia !== 'function'` guard skips tracking in tests; the `.matches` calls are never reached there.)

- [ ] **Step 8: Visual check**

Temporarily render `<Spark />` on `/` (or check it in Task 10): eyes follow the cursor smoothly, orb tilts slightly, hover → bigger puppy eyes with a lime glint, periodic blink. Revert any temporary change.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/spark web/test/eyes.test.ts web/test/Spark.test.tsx
git commit -m "feat(web): Spark orb with cursor-tracking eyes and five expressions"
```

---

### Task 9: API client, visitor id, session hand-off, form validation

**Files:**
- Create: `web/src/lib/api.ts`, `web/src/lib/visitor.ts`, `web/src/lib/session.ts`, `web/src/lib/validate.ts`
- Test: `web/test/api.test.ts`, `web/test/visitor.test.ts`, `web/test/session.test.ts`, `web/test/validate.test.ts`

**Interfaces:**
- Consumes: HTTP contract from Task 4.
- Produces:
  ```ts
  // api.ts
  export interface JoinInfo { url: string; code: string; whatsappNumber: string }
  export interface CountryOption { code: string; name: string; callingCode: string }
  export interface SignupRequest { name: string; profession: string; organization: string; phone: string; city: string; country: string; visitorId: string; source?: string; website: string }
  export interface SignupResponse { signupId: string; existing: boolean; join: JoinInfo }
  export class ApiError extends Error { status: number; code: string; fields?: Record<string, string[]> }
  export function submitSignup(body: SignupRequest): Promise<SignupResponse>;
  export function fetchCountries(): Promise<CountryOption[]>;
  export function trackEvent(name: 'landing_view' | 'join_tapped', signupId?: string): void; // fire-and-forget, keepalive
  // visitor.ts
  export function getVisitorId(): string; // stable per browser via localStorage 'ts_visitor'
  // session.ts
  export interface HandOff { signupId: string; name: string; join: JoinInfo }
  export function saveHandOff(h: HandOff): void; export function loadHandOff(): HandOff | null; // sessionStorage 'ts_handoff'
  export function saveSource(src: string): void; export function loadSource(): string | undefined; // sessionStorage 'ts_src'
  // validate.ts
  export interface SignupFormValues { name: string; profession: string; organization: string; phone: string; city: string; country: string }
  export type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;
  export function validateSignupForm(v: SignupFormValues): FieldErrors;
  export function phoneDigits(raw: string): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// web/test/validate.test.ts
import { describe, it, expect } from 'vitest';
import { phoneDigits, validateSignupForm } from '../src/lib/validate.ts';

const ok = { name: 'Meera Iyer', profession: 'school_teacher', organization: '', phone: '98765 43210', city: 'Pune', country: 'IN' };

describe('validateSignupForm', () => {
  it('accepts a complete form (organization optional)', () => {
    expect(validateSignupForm(ok)).toEqual({});
  });
  it('flags each required field with a human message', () => {
    const e = validateSignupForm({ name: ' ', profession: '', organization: '', phone: '12', city: '', country: '' });
    expect(e.name).toMatch(/name/i);
    expect(e.profession).toMatch(/pick/i);
    expect(e.phone).toMatch(/WhatsApp number/i);
    expect(e.city).toMatch(/city/i);
    expect(e.country).toMatch(/country/i);
  });
  it('requires 6–15 digits in the phone after stripping formatting', () => {
    expect(validateSignupForm({ ...ok, phone: '+91 (98765) 43-210' })).toEqual({});
    expect(validateSignupForm({ ...ok, phone: '1234567890123456' }).phone).toBeDefined();
    expect(phoneDigits('+91 (98765) 43-210')).toBe('919876543210');
  });
});
```

```ts
// web/test/visitor.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getVisitorId } from '../src/lib/visitor.ts';

describe('getVisitorId', () => {
  beforeEach(() => localStorage.clear());
  it('creates a UUID once and reuses it', () => {
    const a = getVisitorId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(getVisitorId()).toBe(a);
    expect(localStorage.getItem('ts_visitor')).toBe(a);
  });
});
```

```ts
// web/test/session.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadHandOff, loadSource, saveHandOff, saveSource } from '../src/lib/session.ts';

describe('session hand-off', () => {
  beforeEach(() => sessionStorage.clear());
  it('round-trips the hand-off and returns null when absent or corrupt', () => {
    expect(loadHandOff()).toBeNull();
    const h = { signupId: 's1', name: 'Meera', join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' } };
    saveHandOff(h);
    expect(loadHandOff()).toEqual(h);
    sessionStorage.setItem('ts_handoff', '{nope');
    expect(loadHandOff()).toBeNull();
  });
  it('stores the attribution source', () => {
    expect(loadSource()).toBeUndefined();
    saveSource('grp-a');
    expect(loadSource()).toBe('grp-a');
  });
});
```

```ts
// web/test/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, fetchCountries, submitSignup, trackEvent } from '../src/lib/api.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = { name: 'M', profession: 'tutor', organization: '', phone: '9876543210', city: 'Pune', country: 'IN', visitorId: 'v', website: '' };

describe('api client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it('submitSignup posts JSON and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { signupId: 's1', existing: false, join: { url: 'u', code: 'c', whatsappNumber: '+1' } }));
    const res = await submitSignup(req);
    expect(res.signupId).toBe('s1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/signup');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(req);
  });
  it('throws ApiError with status, code and field errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { error: 'bad_request', fields: { name: ['Please enter your name'] } }));
    const err = await submitSignup(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe('bad_request');
    expect((err as ApiError).fields).toEqual({ name: ['Please enter your name'] });
  });
  it('tolerates a non-JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 502 }));
    const err = await submitSignup(req).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe('http_error');
  });
  it('fetchCountries unwraps the list', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { countries: [{ code: 'IN', name: 'India', callingCode: '91' }] }));
    expect(await fetchCountries()).toEqual([{ code: 'IN', name: 'India', callingCode: '91' }]);
  });
  it('trackEvent fires a keepalive POST with the visitor id and never throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(() => trackEvent('join_tapped', 's1')).not.toThrow();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/events');
    expect(init.keepalive).toBe(true);
    const body = JSON.parse(init.body);
    expect(body).toEqual({ visitorId: localStorage.getItem('ts_visitor'), name: 'join_tapped', signupId: 's1' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the four modules**

```ts
// web/src/lib/visitor.ts
const KEY = 'ts_visitor';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Anonymous, per-browser id that ties landing_view → signup → join_tapped together. */
export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return newId(); // storage blocked (private mode): still return something usable for this page
  }
}
```

```ts
// web/src/lib/session.ts
import type { JoinInfo } from './api.ts';

export interface HandOff { signupId: string; name: string; join: JoinInfo }
const HANDOFF = 'ts_handoff';
const SOURCE = 'ts_src';

export function saveHandOff(h: HandOff): void {
  try { sessionStorage.setItem(HANDOFF, JSON.stringify(h)); } catch { /* private mode: /joined will still render from state */ }
}
export function loadHandOff(): HandOff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF);
    if (!raw) return null;
    const h = JSON.parse(raw) as HandOff;
    return h && typeof h.signupId === 'string' && h.join && typeof h.join.url === 'string' ? h : null;
  } catch { return null; }
}
export function saveSource(src: string): void {
  try { sessionStorage.setItem(SOURCE, src.slice(0, 64)); } catch { /* ignore */ }
}
export function loadSource(): string | undefined {
  try { return sessionStorage.getItem(SOURCE) ?? undefined; } catch { return undefined; }
}
```

```ts
// web/src/lib/validate.ts
export interface SignupFormValues { name: string; profession: string; organization: string; phone: string; city: string; country: string }
export type FieldErrors = Partial<Record<keyof SignupFormValues, string>>;

export const phoneDigits = (raw: string): string => raw.replace(/\D/g, '');

/** Cheap client-side checks for instant feedback. The server's normalizePhone() is the source of truth. */
export function validateSignupForm(v: SignupFormValues): FieldErrors {
  const e: FieldErrors = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your name';
  if (!v.profession) e.profession = 'Please pick one';
  const digits = phoneDigits(v.phone);
  if (digits.length < 6 || digits.length > 15) e.phone = 'Please enter a valid WhatsApp number';
  if (v.city.trim().length < 2) e.city = 'Please enter your city';
  if (!/^[A-Za-z]{2}$/.test(v.country)) e.country = 'Please pick your country';
  return e;
}
```

```ts
// web/src/lib/api.ts
import { getVisitorId } from './visitor.ts';

export interface JoinInfo { url: string; code: string; whatsappNumber: string }
export interface CountryOption { code: string; name: string; callingCode: string }
export interface SignupRequest {
  name: string; profession: string; organization: string; phone: string; city: string; country: string;
  visitorId: string; source?: string;
  website: string; // honeypot — always '' from a real browser
}
export interface SignupResponse { signupId: string; existing: boolean; join: JoinInfo }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly fields?: Record<string, string[]>) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'http_error';
    let fields: Record<string, string[]> | undefined;
    try {
      const body = (await res.json()) as { error?: string; fields?: Record<string, string[]> };
      code = body.error ?? code;
      fields = body.fields;
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, fields);
  }
  return (await res.json()) as T;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function submitSignup(body: SignupRequest): Promise<SignupResponse> {
  return parse<SignupResponse>(await fetch('/api/signup', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }));
}

export async function fetchCountries(): Promise<CountryOption[]> {
  return (await parse<{ countries: CountryOption[] }>(await fetch('/api/countries'))).countries;
}

/** Fire-and-forget funnel event. keepalive lets it survive the navigation that usually follows a tap. */
export function trackEvent(name: 'landing_view' | 'join_tapped', signupId?: string): void {
  const body = JSON.stringify({ visitorId: getVisitorId(), name, signupId });
  try {
    void fetch('/api/events', { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(() => {});
  } catch { /* fetch itself threw (very old browser) — analytics must never break the page */ }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (validate 3, visitor 1, session 2, api 5); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib web/test/api.test.ts web/test/visitor.test.ts web/test/session.test.ts web/test/validate.test.ts
git commit -m "feat(web): API client, visitor id, session hand-off, form validation"
```

---

### Task 10: Landing page

**Files:**
- Create: `web/src/pages/Landing.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/test/Landing.test.tsx`, update `web/test/App.test.tsx`

**Interfaces:**
- Consumes: `Spark`, `NeonButton`, `trackEvent`, `saveSource`.
- Produces: `export function Landing(): JSX.Element` — fires `landing_view` once per tab session (sessionStorage `ts_lv`), stores `?src=` for attribution.

- [ ] **Step 1: Write the failing tests**

```tsx
// web/test/Landing.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Landing } from '../src/pages/Landing.tsx';

describe('Landing', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

  it('renders the hero with the orb and a Get started CTA to /join', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('img', { name: /Spark/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get started/ })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('heading', { name: /How it works/ })).toHaveAttribute('id', 'how');
    expect(screen.getByText(/No student data/)).toBeInTheDocument();
  });
  it('tracks landing_view once per session and stores ?src=', () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/?src=grp-a']}><Landing /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).name).toBe('landing_view');
    expect(sessionStorage.getItem('ts_src')).toBe('grp-a');
    unmount();
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(fetchMock).toHaveBeenCalledTimes(1); // deduped within the tab session
  });
  it('Spark goes starry while the CTA is hovered', async () => {
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><Landing /></MemoryRouter>);
    await user.hover(screen.getByRole('link', { name: /Get started/ }));
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'starry');
    await user.unhover(screen.getByRole('link', { name: /Get started/ }));
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'default');
  });
});
```

Update `web/test/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.tsx';

describe('App', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 }))));
  afterEach(() => vi.unstubAllGlobals());
  it('renders the landing page on / with the nav CTA', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });
  it('falls back to the landing page for unknown routes', () => {
    render(<MemoryRouter initialEntries={['/nope']}><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/worksheets/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — `Landing` not found; App test fails on heading text.

- [ ] **Step 3: Create `Landing.tsx`**

```tsx
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
    } catch { /* private mode: fall through and track anyway */ }
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
```

- [ ] **Step 4: Route it in `App.tsx`**

```tsx
import { Route, Routes, useLocation } from 'react-router';
import { Nav } from './components/Nav.tsx';
import { showSignupCta } from './lib/nav.ts';
import { Landing } from './pages/Landing.tsx';

export function App() {
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <Nav showSignup={showSignupCta(pathname)} />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (Landing 3, App 2, plus earlier suites); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Landing.tsx web/src/App.tsx web/test/Landing.test.tsx web/test/App.test.tsx
git commit -m "feat(web): landing page with Spark hero, product blurbs, and landing_view tracking"
```

---

### Task 11: Sign-up page (`/join`)

**Files:**
- Create: `web/src/pages/Join.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/test/Join.test.tsx`

**Interfaces:**
- Consumes: `validateSignupForm`, `submitSignup`, `fetchCountries`, `ApiError`, `getVisitorId`, `saveHandOff`, `loadSource`, `Spark`.
- Produces: `export function Join(): JSX.Element` — on success saves the hand-off, shows Spark 'happy' for 700 ms, then navigates to `/joined`.

- [ ] **Step 1: Write the failing tests**

```tsx
// web/test/Join.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Join } from '../src/pages/Join.tsx';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const countries = { countries: [{ code: 'IN', name: 'India', callingCode: '91' }, { code: 'US', name: 'United States', callingCode: '1' }] };
const success = { signupId: 's1', existing: false, join: { url: 'https://wa.me/14155238886?text=join%20x', code: 'x', whatsappNumber: '+14155238886' } };

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join']}>
      <Routes>
        <Route path="/join" element={<Join />} />
        <Route path="/joined" element={<h1>JOINED PAGE</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Your name/), 'Meera Iyer');
  await user.selectOptions(screen.getByLabelText(/Profession/), 'school_teacher');
  await user.type(screen.getByLabelText(/School/), 'DPS Pune');
  await user.type(screen.getByLabelText(/WhatsApp number/), '98765 43210');
  await user.type(screen.getByLabelText(/City/), 'Pune');
}

describe('Join', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    sessionStorage.clear(); localStorage.clear();
    fetchMock.mockImplementation((url: string) => Promise.resolve(url === '/api/countries' ? json(200, countries) : json(201, success)));
  });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockReset(); });

  it('renders all fields, the consent line, the honeypot, and loads the country list (India preselected)', async () => {
    renderJoin();
    expect(screen.getByLabelText(/Your name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Profession/)).toBeInTheDocument();
    expect(screen.getByLabelText(/School/)).toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/)).toBeInTheDocument();
    expect(screen.getByText(/No student data, ever/)).toBeInTheDocument();
    expect(document.querySelector('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(screen.getByRole('option', { name: /United States/ })).toBeInTheDocument());
    expect(screen.getByLabelText(/Country/)).toHaveValue('IN');
    expect(screen.getByText('+91')).toBeInTheDocument();
  });
  it('shows inline errors and does not call the API when the form is invalid', async () => {
    const user = userEvent.setup();
    renderJoin();
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByText('Please enter your name')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/signup')).toHaveLength(0);
  });
  it('submits, saves the hand-off, shows a happy Spark, then navigates to /joined', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('ts_src', 'grp-a');
    const { container } = renderJoin();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    await waitFor(() => expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'happy'));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/signup')!;
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ name: 'Meera Iyer', profession: 'school_teacher', organization: 'DPS Pune', phone: '98765 43210', city: 'Pune', country: 'IN', source: 'grp-a', website: '' });
    expect(body.visitorId).toBe(localStorage.getItem('ts_visitor'));
    expect(JSON.parse(sessionStorage.getItem('ts_handoff')!)).toEqual({ signupId: 's1', name: 'Meera Iyer', join: success.join });
    // real timers: the page navigates 700 ms after success
    expect(await screen.findByText('JOINED PAGE', {}, { timeout: 3000 })).toBeInTheDocument();
  });
  it('maps a 422 to a phone field error and a 429 to a banner', async () => {
    const user = userEvent.setup();
    renderJoin();
    await fillValid(user);
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(422, { error: 'invalid_phone' })));
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByText(/doesn't look like a valid WhatsApp number/)).toBeInTheDocument();
    fetchMock.mockImplementationOnce(() => Promise.resolve(json(429, { error: 'rate_limited' })));
    await user.click(screen.getByRole('button', { name: /Get my WhatsApp link/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — `Join` not found.

- [ ] **Step 3: Create `Join.tsx`**

```tsx
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { ApiError, fetchCountries, submitSignup, type CountryOption } from '../lib/api.ts';
import { getVisitorId } from '../lib/visitor.ts';
import { loadSource, saveHandOff } from '../lib/session.ts';
import { validateSignupForm, type FieldErrors, type SignupFormValues } from '../lib/validate.ts';

const PROFESSION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'school_teacher', label: 'School teacher' },
  { value: 'tutor', label: 'Tutor / coaching' },
  { value: 'school_leader', label: 'Principal / school leader' },
  { value: 'teacher_trainer', label: 'Teacher trainer' },
  { value: 'parent', label: 'Parent' },
  { value: 'student', label: 'Student teacher' },
  { value: 'other', label: 'Other' },
];
const FALLBACK_COUNTRIES: CountryOption[] = [{ code: 'IN', name: 'India', callingCode: '91' }];
const EMPTY: SignupFormValues = { name: '', profession: '', organization: '', phone: '', city: '', country: 'IN' };

export function Join() {
  const navigate = useNavigate();
  const [values, setValues] = useState<SignupFormValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>(FALLBACK_COUNTRIES);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    let alive = true;
    fetchCountries().then((list) => { if (alive && list.length) setCountries(list); }).catch(() => { /* keep the fallback */ });
    return () => { alive = false; };
  }, []);

  const callingCode = countries.find((c) => c.code === values.country)?.callingCode ?? '';
  const set = (k: keyof SignupFormValues) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    const fieldErrors = validateSignupForm(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    try {
      const res = await submitSignup({ ...values, visitorId: getVisitorId(), source: loadSource(), website: honeypot });
      saveHandOff({ signupId: res.signupId, name: values.name.trim(), join: res.join });
      setDone(true); // Spark beams for a beat before the hand-off screen
      setTimeout(() => navigate('/joined'), 700);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 422) {
        setErrors({ phone: "That doesn't look like a valid WhatsApp number for the selected country" });
      } else if (err instanceof ApiError && err.status === 429) {
        setBanner('Too many attempts from this network — please try again in a few minutes.');
      } else if (err instanceof ApiError && err.status === 400 && err.fields) {
        const mapped: FieldErrors = {};
        for (const [k, msgs] of Object.entries(err.fields)) mapped[k as keyof SignupFormValues] = msgs[0];
        setErrors(mapped);
      } else {
        setBanner("Something went wrong on our side. Please try again — if it keeps failing, message us and we'll add you by hand.");
      }
    }
  }

  const field = (k: keyof SignupFormValues, label: string, input: ReactNode) => (
    <div className={`field${errors[k] ? ' field--error' : ''}`}>
      <label htmlFor={`f-${k}`}>{label}</label>
      {input}
      {errors[k] && <span className="field__error" id={`e-${k}`}>{errors[k]}</span>}
    </div>
  );

  return (
    <main className="form">
      <div style={{ width: 120, margin: '0 auto 8px' }}><Spark mood={done ? 'happy' : 'default'} size={120} /></div>
      <h1>Join the TeachSpark pilot</h1>
      <p className="form__lead">Tell us a little about yourself and we'll hand you the WhatsApp link. Takes 30 seconds.</p>
      {banner && <div className="banner" role="alert">{banner}</div>}
      <form onSubmit={onSubmit} noValidate>
        {field('name', 'Your name', <input id="f-name" name="name" autoComplete="name" value={values.name} onChange={set('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'e-name' : undefined} />)}
        {field('profession', 'Profession', (
          <select id="f-profession" name="profession" value={values.profession} onChange={set('profession')} aria-invalid={!!errors.profession}>
            <option value="">Choose…</option>
            {PROFESSION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {field('organization', 'School / organisation (optional)', <input id="f-organization" name="organization" autoComplete="organization" value={values.organization} onChange={set('organization')} />)}
        {field('country', 'Country', (
          <select id="f-country" name="country" autoComplete="country" value={values.country} onChange={set('country')} aria-invalid={!!errors.country}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name} (+{c.callingCode})</option>)}
          </select>
        ))}
        {field('phone', 'WhatsApp number', (
          <div className="phone">
            <span className="phone__cc" aria-hidden="true">+{callingCode}</span>
            <input id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="98765 43210" value={values.phone} onChange={set('phone')} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'e-phone' : undefined} />
          </div>
        ))}
        {field('city', 'City', <input id="f-city" name="city" autoComplete="address-level2" value={values.city} onChange={set('city')} aria-invalid={!!errors.city} />)}
        <div className="hp" aria-hidden="true">
          <label htmlFor="f-website">Website</label>
          <input id="f-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>
        <p className="consent">We'll only use this to connect you to TeachSpark on WhatsApp. No student data, ever.</p>
        <button type="submit" className="btn-submit" disabled={busy}>{busy ? 'One moment…' : 'Get my WhatsApp link'}</button>
      </form>
    </main>
  );
}
```
- [ ] **Step 4: Route it** in `App.tsx`: `import { Join } from './pages/Join.tsx';` and add `<Route path="/join" element={<Join />} />` before the `*` route.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (Join: 4); tsc clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/Join.tsx web/src/App.tsx web/test/Join.test.tsx
git commit -m "feat(web): sign-up form with validation, honeypot, country codes, and happy Spark"
```

---

### Task 12: Hand-off page (`/joined`)

**Files:**
- Create: `web/src/pages/Joined.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/test/Joined.test.tsx`

**Interfaces:**
- Consumes: `loadHandOff`, `trackEvent`, `NeonButton`, `Spark`.
- Produces: `export function Joined(): JSX.Element` — redirects to `/join` without a hand-off; tapping the join button fires `join_tapped`.

- [ ] **Step 1: Write the failing tests**

```tsx
// web/test/Joined.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Joined } from '../src/pages/Joined.tsx';

const handoff = { signupId: 's1', name: 'Meera Iyer', join: { url: 'https://wa.me/14155238886?text=join%20captain-cheese', code: 'captain-cheese', whatsappNumber: '+14155238886' } };

function renderJoined() {
  return render(
    <MemoryRouter initialEntries={['/joined']}>
      <Routes>
        <Route path="/joined" element={<Joined />} />
        <Route path="/join" element={<h1>JOIN PAGE</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Joined', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); sessionStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); fetchMock.mockClear(); });

  it('redirects to /join when there is no hand-off', () => {
    renderJoined();
    expect(screen.getByText('JOIN PAGE')).toBeInTheDocument();
  });
  it('greets by name, shows the starry Spark, the wa.me button, the three steps and the manual fallback', () => {
    sessionStorage.setItem('ts_handoff', JSON.stringify(handoff));
    const { container } = renderJoined();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Meera/);
    expect(container.querySelector('.spark')).toHaveAttribute('data-state', 'starry');
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    expect(btn).toHaveAttribute('href', handoff.join.url);
    expect(btn).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText(/join captain-cheese/)).toHaveLength(2); // step 1 + manual fallback
    expect(screen.getByText(/\+14155238886/)).toBeInTheDocument();
    expect(screen.getByText(/tap the button again/i)).toBeInTheDocument();
  });
  it('tracks join_tapped with the signup id when the button is tapped', async () => {
    sessionStorage.setItem('ts_handoff', JSON.stringify(handoff));
    renderJoined();
    const btn = screen.getByRole('link', { name: /Open WhatsApp & Join/ });
    btn.addEventListener('click', (e) => e.preventDefault()); // jsdom: don't actually navigate
    await userEvent.click(btn);
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/events')!;
    expect(JSON.parse(call[1].body)).toMatchObject({ name: 'join_tapped', signupId: 's1' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web`
Expected: FAIL — `Joined` not found.

- [ ] **Step 3: Create `Joined.tsx`**

```tsx
import { Navigate } from 'react-router';
import { Spark } from '../components/spark/Spark.tsx';
import { NeonButton } from '../components/NeonButton.tsx';
import { trackEvent } from '../lib/api.ts';
import { loadHandOff } from '../lib/session.ts';

export function Joined() {
  const handoff = loadHandOff();
  if (!handoff) return <Navigate to="/join" replace />;
  const firstName = handoff.name.split(/\s+/)[0] ?? handoff.name;
  const { url, code, whatsappNumber } = handoff.join;

  return (
    <main className="joined">
      <div style={{ width: 180, margin: '0 auto' }}><Spark mood="starry" size={180} /></div>
      <h1>You're in, {firstName}! 🎉</h1>
      <p className="joined__lead">One last step: connect on WhatsApp. The button opens WhatsApp with the join message already typed for you.</p>
      <NeonButton href={url} size="lg" onClick={() => trackEvent('join_tapped', handoff.signupId)}>Open WhatsApp &amp; Join</NeonButton>
      <ol className="steps">
        <li><span className="card__num">1</span><span>Tap the button above — WhatsApp opens with <code>join {code}</code> pre-filled.</span></li>
        <li><span className="card__num">2</span><span><strong>Send</strong> that message as it is. You'll get a "connected" reply.</span></li>
        <li><span className="card__num">3</span><span>Then type <strong>Hi</strong> to start your first worksheet.</span></li>
      </ol>
      <p className="joined__fallback">
        Didn't open? Save <strong>{whatsappNumber}</strong> in your contacts and send it <code>join {code}</code> yourself.<br />
        It's a small pilot — if it ever stops replying, just tap the button again to rejoin.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Route it** in `App.tsx`: `import { Joined } from './pages/Joined.tsx';` and add `<Route path="/joined" element={<Joined />} />`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test:web && npm run typecheck`
Expected: PASS (Joined: 3); tsc clean.

- [ ] **Step 6: End-to-end manual check against the real API**

Terminal 1: `npm run dev` (Express on :3000, needs `.env`). Terminal 2: `npm run dev:web`. Open http://localhost:5173 → Get started → fill the form with your own number → expect the `/joined` page with the real join link from `TWILIO_SANDBOX_JOIN_CODE`. In Supabase, confirm one `signups` row and `web_events` rows `landing_view`, `signup_submitted`; tap the button → `join_tapped` row and `join_tapped_at` set. Delete the test row afterwards.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/Joined.tsx web/src/App.tsx web/test/Joined.test.tsx
git commit -m "feat(web): WhatsApp hand-off page with join_tapped tracking"
```

---

### Task 13: Brand assets (OG cover + icons) and link-preview tags

**Files:**
- Create: `assets/fonts/Inter-Bold.ttf`, `assets/fonts/Inter-Regular.ttf`, `assets/fonts/OFL.txt` (vendored), `scripts/brand-assets.ts`, generated `web/public/og-cover.png`, `web/public/pwa-192x192.png`, `web/public/pwa-512x512.png`, `web/public/maskable-icon-512x512.png`, `web/public/apple-touch-icon-180x180.png`, `web/public/favicon.svg`
- Modify: `package.json` (devDependency + script), `web/index.html` (OG/Twitter/icon tags)
- Test: `test/brand-assets.test.ts` (validates the committed PNGs)

**Interfaces:**
- Produces: `npm run brand:assets` regenerates every file in `web/public/` deterministically. `web/dist/index.html` carries absolute `og:image`/`og:url` built from `PUBLIC_BASE_URL`.

- [ ] **Step 1: Vendor the fonts (one-time) and install resvg**

```bash
mkdir -p assets/fonts
curl -sSL -o assets/fonts/Inter-Bold.ttf    'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf'
curl -sSL -o assets/fonts/Inter-Regular.ttf 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf'
curl -sSL -o assets/fonts/OFL.txt           'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt'
ls -l assets/fonts   # expect ≈326468, ≈324820, ≈4377 bytes; if a URL 404s, rediscover with: curl -s -A 'curl/8' 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700'
npm i -D @resvg/resvg-js@^2.6.2
```
Add to root `package.json` scripts: `"brand:assets": "tsx scripts/brand-assets.ts"`.

- [ ] **Step 2: Write the failing test** (checks the committed outputs, so CI never needs the native addon)

```ts
// test/brand-assets.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';

const pub = (f: string) => fileURLToPath(new URL(`../web/public/${f}`, import.meta.url));

describe('brand assets in web/public', () => {
  it('og-cover.png is 1200x630 and under 1 MB', () => {
    const buf = readFileSync(pub('og-cover.png'));
    expect(imageSize(buf)).toMatchObject({ width: 1200, height: 630, type: 'png' });
    expect(buf.length).toBeLessThan(1_000_000);
  });
  it.each([['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['maskable-icon-512x512.png', 512], ['apple-touch-icon-180x180.png', 180]])('%s is %ipx square', (file, px) => {
    expect(imageSize(readFileSync(pub(file)))).toMatchObject({ width: px, height: px });
  });
  it('favicon.svg exists and is an svg', () => {
    expect(existsSync(pub('favicon.svg'))).toBe(true);
    expect(readFileSync(pub('favicon.svg'), 'utf8')).toMatch(/^<svg/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:api -- test/brand-assets.test.ts`
Expected: FAIL — ENOENT `web/public/og-cover.png`.

- [ ] **Step 4: Create `scripts/brand-assets.ts`**

```ts
// Renders every brand bitmap from inline SVG so the wordmark is crisp and the output is identical on
// every machine. Fonts are vendored (static Inter instances) because resvg ignores variable-font axes.
//   npm run brand:assets   -> web/public/{og-cover.png, pwa-*.png, maskable-icon-512x512.png, apple-touch-icon-180x180.png, favicon.svg}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { imageSize } from 'image-size';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = resolve(ROOT, 'web/public');
const FONT_FILES = ['Inter-Bold.ttf', 'Inter-Regular.ttf'].map((f) => resolve(ROOT, 'assets/fonts', f));
for (const f of FONT_FILES) if (!existsSync(f)) throw new Error(`missing font file: ${f} (see docs/superpowers/plans Task 13 step 1)`);

const BG = '#0a0a0a';
const LIME = '#b6ff3b';

/** Spark: the same gradients as web/src/components/spark/Spark.tsx, eyes looking slightly right. */
function orb(cx: number, cy: number, r: number, id: string): string {
  const ew = r * 0.24, eh = r * 0.41, rx = ew * 0.45;
  return `
  <defs>
    <radialGradient id="${id}-body" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#2fd65f"/><stop offset="45%" stop-color="#169a3c"/><stop offset="100%" stop-color="#062b14"/></radialGradient>
    <radialGradient id="${id}-gloss" cx="30%" cy="22%" r="45%"><stop offset="0%" stop-color="#fff" stop-opacity=".5"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-body)"/>
  <ellipse cx="${cx - r * 0.33}" cy="${cy - r * 0.53}" rx="${r * 0.47}" ry="${r * 0.32}" fill="url(#${id}-gloss)"/>
  <rect x="${cx - r * 0.36 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>
  <rect x="${cx + r * 0.18 - ew / 2}" y="${cy - r * 0.06 - eh / 2}" width="${ew}" height="${eh}" rx="${rx}" fill="#fff"/>`;
}

function render(svg: string, width: number, out: string): void {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false, fontFiles: FONT_FILES, defaultFontFamily: 'Inter' }, logLevel: 'warn' }).render().asPng();
  writeFileSync(out, png);
  const { width: w, height: h } = imageSize(readFileSync(out));
  console.log(`wrote ${out} (${w}x${h}, ${png.length} bytes)`);
}

mkdirSync(OUT_DIR, { recursive: true });

// 1) Open Graph cover 1200x630
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>
  <ellipse cx="250" cy="520" rx="150" ry="20" fill="#1f8a3a" opacity=".35"/>
  ${orb(250, 315, 150, 'og')}
  <text x="470" y="300" font-family="Inter" font-weight="700" font-size="104" fill="#fff" letter-spacing="-3">TeachSpark</text>
  <text x="474" y="362" font-family="Inter" font-weight="400" font-size="36" fill="${LIME}">Ready-to-use worksheets, on WhatsApp</text>
  <text x="474" y="412" font-family="Inter" font-weight="400" font-size="26" fill="#a3a3a3">3 levels + answer key + PDF, in about 2 minutes.</text>
  <text x="474" y="450" font-family="Inter" font-weight="400" font-size="26" fill="#a3a3a3">Free pilot for teachers.</text>
</svg>`;
// NB: the grey line is split in two on purpose — as one line at 26px it runs past x=1200 and clips ("Free pilot f…").
// Keep each grey line ≤ ~50 characters; open the PNG after generating and confirm nothing touches the right edge.
render(og, 1200, resolve(OUT_DIR, 'og-cover.png'));
const ogBytes = readFileSync(resolve(OUT_DIR, 'og-cover.png')).length;
if (ogBytes > 1_000_000) throw new Error(`og-cover.png is ${ogBytes} bytes; must be < 1 MB`);

// 2) Icons. Transparent for the regular icons; padded on the dark brand background for maskable/apple.
const iconSvg = (size: number, padded: boolean) => {
  const r = padded ? size * 0.3 : size * 0.46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${padded ? `<rect width="${size}" height="${size}" fill="${BG}"/>` : ''}
  ${orb(size / 2, size / 2, r, 'ic')}
</svg>`;
};
render(iconSvg(192, false), 192, resolve(OUT_DIR, 'pwa-192x192.png'));
render(iconSvg(512, false), 512, resolve(OUT_DIR, 'pwa-512x512.png'));
render(iconSvg(512, true), 512, resolve(OUT_DIR, 'maskable-icon-512x512.png'));
render(iconSvg(180, true), 180, resolve(OUT_DIR, 'apple-touch-icon-180x180.png'));

// 3) SVG favicon (vector; browsers that support it get a crisp tab icon at any size)
writeFileSync(resolve(OUT_DIR, 'favicon.svg'), iconSvg(64, false));
console.log('wrote favicon.svg');
```

- [ ] **Step 5: Generate and eyeball**

Run: `npm run brand:assets && open web/public/og-cover.png`
Expected: six files written; the cover shows the orb on the left, bold white "TeachSpark", lime tagline, grey sub-line — all text crisp (if the wordmark is missing, a font file failed to load; the script would have warned).

- [ ] **Step 6: Link-preview + icon tags in `web/index.html`**

Replace the `<head>` with:

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0a0a0a" />
    <title>TeachSpark — worksheets for your class, on WhatsApp</title>
    <meta name="description" content="TeachSpark writes a ready-to-use, 3-level worksheet for your own class in about 2 minutes — on WhatsApp. Free pilot for teachers." />

    <!-- Link preview (absolute URLs are baked in at build time from PUBLIC_BASE_URL) -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="TeachSpark" />
    <meta property="og:title" content="TeachSpark — worksheets for your class, on WhatsApp" />
    <meta property="og:description" content="A 3-level worksheet with answer key and PDF for your own class in about 2 minutes. Free pilot for teachers — no app, no login, just WhatsApp." />
    <meta property="og:url" content="%PUBLIC_BASE_URL%/" />
    <meta property="og:image" content="%PUBLIC_BASE_URL%/og-cover.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Spark, the green TeachSpark orb, next to the words TeachSpark — ready-to-use worksheets on WhatsApp" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="TeachSpark — worksheets for your class, on WhatsApp" />
    <meta name="twitter:description" content="A 3-level worksheet with answer key and PDF for your own class in about 2 minutes. Free pilot for teachers." />
    <meta name="twitter:image" content="%PUBLIC_BASE_URL%/og-cover.png" />

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/pwa-192x192.png" type="image/png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700;800&display=swap" rel="stylesheet" />
  </head>
```

- [ ] **Step 7: Verify the build bakes absolute URLs and the unset case fails loudly**

```bash
npm run test:api -- test/brand-assets.test.ts
PUBLIC_BASE_URL=https://example.test npm run build:web && grep -o 'og:image" content="[^"]*"' web/dist/index.html
env -u PUBLIC_BASE_URL npm run build:web; echo "exit=$?"
```
Expected: test PASS (6); grep prints `og:image" content="https://example.test/og-cover.png"`; the third command exits non-zero with the `PUBLIC_BASE_URL must be set` error *unless* the root `.env` provides it (then it prints the ngrok URL — also fine: the guard is for Railway, where `.env` does not exist).

- [ ] **Step 8: Commit**

```bash
git add assets/fonts scripts/brand-assets.ts web/public web/index.html package.json package-lock.json test/brand-assets.test.ts
git commit -m "feat(web): brand assets script, OG cover, icons, and link-preview tags"
```

---

### Task 14: PWA — manifest, service worker, safe denylist

**Files:**
- Create: `web/pwa.routes.ts`, `web/test/pwa-routes.test.ts`
- Modify: `web/vite.config.ts`, `web/src/main.tsx`

**Interfaces:**
- Produces: `web/pwa.routes.ts` exports `NON_SPA_ROUTES: RegExp` (imported by `vite.config.ts`); build emits `web/dist/sw.js`, `web/dist/manifest.webmanifest`; `main.tsx` registers the SW with `autoUpdate`.

- [ ] **Step 1: Write the failing regex test**

```ts
// web/test/pwa-routes.test.ts
import { describe, it, expect } from 'vitest';
import { NON_SPA_ROUTES } from '../pwa.routes.ts';

describe('NON_SPA_ROUTES (service-worker navigation denylist)', () => {
  it.each(['/api', '/api/', '/api/signup', '/api?x=1', '/webhooks/twilio/whatsapp', '/admin', '/admin/metrics?token=1', '/health', '/health?x', '/internal/cron/nudges'])('denies %s', (p) => {
    expect(NON_SPA_ROUTES.test(p)).toBe(true);
  });
  it.each(['/', '/index.html', '/join', '/joined', '/apiary', '/healthy', '/administer', '/app/api', '/lessons/api'])('allows %s', (p) => {
    expect(NON_SPA_ROUTES.test(p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:web -- pwa-routes`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/pwa.routes.ts`**

```ts
// Paths the backend owns. Workbox tests this against url.pathname + url.search of NAVIGATION requests,
// so typing /admin/metrics or /health into the address bar never gets the SPA shell instead.
// fetch()/XHR and Twilio's POSTs are unaffected either way: the SW has no runtime caching routes.
export const NON_SPA_ROUTES = /^\/(api|webhooks|admin|internal|health)(?=[\/?#]|$)/;
```

- [ ] **Step 4: Add the plugin to `web/vite.config.ts`**

```ts
import { VitePWA } from 'vite-plugin-pwa';
import { NON_SPA_ROUTES } from './pwa.routes.ts';
// …inside the returned config:
    plugins: [
      react(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'autoUpdate', // the plugin adds skipWaiting + clientsClaim while injectRegister stays 'auto'
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'og-cover.png'],
        manifest: {
          name: 'TeachSpark',
          short_name: 'TeachSpark',
          description: 'Ready-to-use worksheets and question papers for your class, on WhatsApp.',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'pwa-*.png', 'maskable-icon-512x512.png', 'apple-touch-icon-180x180.png'],
          globIgnores: ['**/og-cover.png'], // scrapers fetch it; no need to precache 60 KB into every install
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [NON_SPA_ROUTES],
          cleanupOutdatedCaches: true,
          // No runtimeCaching on purpose: /api and /webhooks must always hit the network.
        },
        devOptions: { enabled: process.env.PWA_DEV === '1' }, // opt-in only; a dev SW masks proxy changes
      }),
    ],
```

- [ ] **Step 5: Register the SW in `web/src/main.tsx`**

Add after the css import:

```ts
import { registerSW } from 'virtual:pwa-register';

registerSW({
  immediate: true,
  onRegisterError(err) { console.error('[pwa] service worker registration failed', err); },
});
```

- [ ] **Step 6: Build and verify the worker**

```bash
npm run test:web -- pwa-routes
PUBLIC_BASE_URL=https://example.test npm run build:web
ls web/dist/sw.js web/dist/manifest.webmanifest web/dist/workbox-*.js
grep -c 'denylist' web/dist/sw.js            # expect 1
grep -o 'api|webhooks|admin|internal|health' web/dist/sw.js | head -1
grep -c 'registerRoute' web/dist/sw.js        # navigation route only: expect 1 (plus precacheAndRoute, which is a different identifier)
grep -o '"name":"TeachSpark"' web/dist/manifest.webmanifest
grep -o 'rel="manifest"' web/dist/index.html
npm run test && npm run typecheck
```
Expected: test PASS (19 cases); all files present; the denylist regex appears in `sw.js`; manifest has the name; `index.html` links the manifest; full test + typecheck green.

- [ ] **Step 7: Installability check (local preview)**

Run: `npm run build && npm start` (serves `web/dist` through Express on :3000). In Chrome open http://localhost:3000 → DevTools → Application → Manifest: name/icons render and the *Installability* section shows no errors (localhost counts as secure). Application → Service workers: `sw.js` activated. Navigate to http://localhost:3000/health in the address bar → JSON `{"ok":true}`, **not** the app shell.

- [ ] **Step 8: Commit**

```bash
git add web/pwa.routes.ts web/vite.config.ts web/src/main.tsx web/test/pwa-routes.test.ts
git commit -m "feat(web): installable PWA with a service worker that never shadows backend routes"
```

---

### Task 15: Responsive, accessibility, and reduced-motion gate

**Files:**
- Modify (only if the checks below fail): `web/src/styles/global.css`, `web/src/components/NeonButton.css`, `web/src/components/spark/Spark.css`
- Create: `docs/qa/phase-7-landing.md` (the checklist with results)

**Interfaces:** none — verification task. The CSS from Tasks 7/8 already carries the breakpoints; this task proves them.

- [ ] **Step 1: Build and serve the production bundle**

Run: `npm run build && npm start` (leave running).

- [ ] **Step 2: Check each viewport in Chrome (DevTools device toolbar) and record results in `docs/qa/phase-7-landing.md`**

Create the file with this checklist and fill in PASS/FAIL + notes per row:

```markdown
# QA — Phase 7 (Landing PWA, Phase 1): responsive / a11y / motion

Build: <git sha>  ·  Date: <date>  ·  Tester: <name/agent>

| # | Check | 375×812 | 768×1024 | 1280×800 |
|---|-------|---------|----------|----------|
| 1 | No horizontal scroll: in Console `document.documentElement.scrollWidth <= window.innerWidth` → true on /, /join, /joined | | | |
| 2 | Nav: brand + Sign up visible; at ≤768 the ☰ toggle opens/closes the pill menu; links navigate | | | |
| 3 | Hero: orb renders above the headline at ≤900; headline readable without zoom; CTA tappable (≥44px tall) | | | |
| 4 | Neon CTA: border light travels around the button; bloom visible; hover speeds it up (desktop) | | | |
| 5 | Spark: eyes follow the cursor (desktop); drift idly (touch emulation); blink every few seconds; hover → puppy eyes | | n/a | |
| 6 | /join: every field full-width at 375; phone prefix shows +91 for India; inline errors readable; submit button ≥52px | | | |
| 7 | /joined: Open WhatsApp button is the dominant element; three steps legible; manual fallback shows number + code | | | |
| 8 | Keyboard: Tab reaches brand → nav links → Sign up → form fields → submit, with a visible lime focus ring | | | |
| 9 | Screen reader labels: orb announced as "Spark, the TeachSpark mascot…"; form fields announced with labels; errors via aria-describedby | | | |
| 10 | Reduced motion (DevTools › Rendering › Emulate prefers-reduced-motion: reduce): neon ring static, Spark stops tracking/tilting but still blinks, starry eyes don't twinkle | | | |
| 11 | Contrast: muted text #a3a3a3 on #0a0a0a ≥ 4.5:1; lime-on-black CTA text ≥ 4.5:1 (DevTools colour picker) | | | |
| 12 | Lighthouse (mobile, Performance + Accessibility + Best Practices): Accessibility ≥ 95, no "tap targets too small" | | | |

Findings / fixes applied:
- …
```

- [ ] **Step 3: Fix anything that fails, re-run the failing row(s), and re-run the unit tests**

Run: `npm test && npm run typecheck`
Expected: green. Typical fixes: bump `.nav__pill` padding for tap targets, tighten `.hero__title` clamp at 375, add `overflow: hidden` on `.hero__orb` if the glow bleeds.

- [ ] **Step 4: Commit**

```bash
git add docs/qa/phase-7-landing.md web/src
git commit -m "test(web): responsive, a11y and reduced-motion QA for the landing PWA"
```

---

### Task 16: Deploy to Railway, verify the link preview, update the docs

**Files:**
- Modify: `docs/runbook.md`, `docs/pilot/pitch.md`, `README.md`
- Human-in-the-loop: Railway deploy + scraper checks (the executor runs the commands; the user confirms the previews visually).

**Interfaces:** none. Exit criterion for Phase 1.

- [ ] **Step 1: Pre-flight exactly as Railway builds**

```bash
rm -rf node_modules dist web/dist && npm ci && PUBLIC_BASE_URL=https://example.test npm run build && npm test && npm run typecheck
git status --short   # must be clean apart from nothing (dist/ is ignored)
```
Expected: all green; lockfile in sync (`npm ci` did not error).

- [ ] **Step 2: Confirm the Railway variables and migration** *(human-in-the-loop)*

- `railway variables` shows `PUBLIC_BASE_URL=https://<app>.up.railway.app` (no trailing slash) — Vite bakes the OG URLs from it at build time, so it **must** be the public domain, not ngrok.
- The Task 3 migration has been applied to the production Supabase project (re-run the SQL if unsure; it is idempotent).

- [ ] **Step 3: Deploy and smoke-test**

```bash
git push origin feat/landing-pwa          # Railway deploys from the connected branch; if it tracks main, deploy with: railway up --detach
railway logs -n 50 | grep -E "listening|join link|SPA build"
BASE=$(railway variables --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).PUBLIC_BASE_URL))")
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "$BASE/"                 # 200 text/html
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" "$BASE/og-cover.png"  # 200 image/png, < 1000000
curl -s "$BASE/" | grep -o 'og:image" content="[^"]*"'                            # absolute https URL on the Railway domain
curl -s "$BASE/health"                                                             # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/countries"                     # 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/manifest.webmanifest"              # 200
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/admin/metrics" | head -c 80 # still JSON, not HTML
```
Expected: every line matches its comment. If `railway logs` shows `SPA build not found`, the build step did not run `npm run build -w web` — check `railway.json` still says `npm ci && npm run build` and that the root `build` script is the Task 6 one.

- [ ] **Step 4: Verify the link preview** *(human-in-the-loop — the user looks at the rendered cards)*

1. https://www.linkedin.com/post-inspector/ → paste `$BASE/` → Inspect. Expected: title, description and the og-cover image render. If an old/blank card shows, click Inspect again (it re-scrapes).
2. https://www.opengraph.xyz/ → paste `$BASE/`. Expected: WhatsApp/Slack/X previews all show the image.
3. Paste `$BASE/?v=1` into a WhatsApp chat with yourself. Expected: unfurls with image. (WhatsApp caches per exact URL; bump `?v=N` after any OG change.)

- [ ] **Step 5: Install it once** *(human-in-the-loop)*

On a phone, open `$BASE/` in Chrome/Safari → "Add to Home Screen" → the TeachSpark icon appears; launching it opens standalone (no browser chrome). Do the full flow once from the installed app: sign up → tap Open WhatsApp & Join → WhatsApp opens with `join <code>` pre-filled.

- [ ] **Step 6: Document**

`docs/runbook.md` — add a section **"Landing PWA (web/)"** after *Architecture* covering: the workspace layout; `npm run dev` + `npm run dev:web` (Vite proxies `/api` to :3000); `npm run build` builds web then api; `PUBLIC_BASE_URL` is also a *build-time* input for the OG tags; `npm run brand:assets` regenerates `web/public`; the two new tables + migration file; the `/api/*` endpoints (copy the contract block from Task 4); the SW denylist and why `/admin`, `/health`, `/api`, `/webhooks`, `/internal` must never move under a path the SPA owns. Add the three new env facts to the *Environment variables* table if it has one (none are new variables — note that `PUBLIC_BASE_URL` now has two jobs).

`docs/pilot/pitch.md` — add **"Variant 0 — Landing link (preferred)"** above Variant 1:

```
📚 For anyone prepping worksheets tonight — I'm piloting *TeachSpark*, a WhatsApp bot that writes a ready-to-use worksheet for YOUR class in about 2 minutes. Free, nothing to install.
Sign up here (30 seconds): <PUBLIC_BASE_URL>
It hands you the WhatsApp link at the end — tap it, send the "join" message that pops up, then type *Hi*.
It never asks for student data — please don't send any — and you can leave anytime.
```
with `<PUBLIC_BASE_URL>` replaced by the real Railway URL from Step 3 (the file already carries the literal join link the same way). Add a sending note: *the landing link unfurls with a preview card — paste it on its own line.*

`README.md` — add one line under the stack line: `Landing page + sign-up PWA: `web/` (Vite + React), served by the same Express app.`

- [ ] **Step 7: Commit and hand over**

```bash
git add docs/runbook.md docs/pilot/pitch.md README.md
git commit -m "docs: landing PWA runbook, pitch variant with the landing link"
git push origin feat/landing-pwa
```

Then invoke `superpowers:finishing-a-development-branch` to choose merge / PR / keep. **Phase 2** (admin dashboard: phone reconciliation, extended `computeFunnel()`, `/admin` session auth, three-band analytics UI) gets its own plan once Phase 1 is live and collecting data.

---

## Self-review (done while writing)

**Spec coverage → task:** data model + migration (1, 3) · phone normalization (2) · `POST /api/signup` with honeypot + rate limit (4) · `POST /api/events` incl. `join_tapped` stamping (4) · `GET /api/countries` (4) · static serving with SPA fallback excluding backend routes (5) · workspace/Vite/tests (6) · design system, pill nav, persistent neon CTA with reduced-motion behaviour (7) · Spark: cursor tracking, parallax tilt, 5 eye states, touch idle drift, reduced motion (8) · API client/visitor id/session hand-off (9) · landing page with copy from pitch.md + `landing_view` + `?src` attribution (10) · `/join` form with all six fields, consent line, validation, error mapping, happy Spark (11) · `/joined` with wa.me button, three steps, `join_tapped`, re-join line, redirect guard (12) · OG/Twitter tags + 1200×630 cover + absolute URLs + icons (13) · installable PWA + SW denylist (14) · mobile 375/768 + a11y + reduced-motion gates (15) · deploy + Post Inspector/opengraph.xyz verification + docs (16). Admin dashboard, reconciliation, CSV/date filters: out of scope by spec (Phase 2).

**Type consistency checked:** `JoinInfo { url, code, whatsappNumber }` identical in `src/http/api.ts` and `web/src/lib/api.ts`; `SignupResponse { signupId, existing, join }` matches the router; `WebEventInput`/`WebEventRow` shapes match across memory/Supabase/api; `AppDeps` gains exactly `signups, webEvents, join, webDist` and every test helper (`app.test.ts`, `api.test.ts`, `static.test.ts`) passes all four; `Spark` props `{ mood, size, blinkEveryMs, className }` used identically in Landing/Join/Joined; `NON_SPA_ROUTES` lives in one module imported by both the config and the test.

**Placeholders:** none — every code step is complete; the only values filled at run time are the Railway domain (Task 16) and QA results (Task 15), which are data, not code.



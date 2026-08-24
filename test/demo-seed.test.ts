import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { demoSignups, demoFunnel, demoWebEvents, DEMO_CITIES } from '../src/metrics/demoSeed.js';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';

const SECRET = 'super-secret-token';
const DEMO = 'demo-viewer-token';
const NOW = new Date('2026-08-23T12:00:00.000Z');

function deps(): AppDeps {
  return {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: SECRET, DEMO_TOKEN: DEMO, CRON_SECRET: 'c' },
    handleInbound: async () => {}, runNudgePass: async () => 0,
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(),
    signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(),
    join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' },
    webDist: null, clock: new FixedClock(NOW),
  };
}

describe('demoSignups', () => {
  it('returns exactly 40 rows, all in India, drawn from the known city set', () => {
    const rows = demoSignups(NOW);
    expect(rows).toHaveLength(40);
    for (const r of rows) {
      expect(r.country).toBe('IN');
      expect(DEMO_CITIES).toContain(r.city);
    }
  });

  it('is deterministic: the same `now` produces byte-identical output', () => {
    const a = demoSignups(NOW);
    const b = demoSignups(NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('gives every row a unique id, no phone (form no longer collects it), and a method split with unique google emails', () => {
    const rows = demoSignups(NOW);
    expect(new Set(rows.map((r) => r.id)).size).toBe(40);
    expect(rows.every((r) => r.phoneE164 === null)).toBe(true);
    // Both signup methods are represented so /admin has a split to render.
    expect(new Set(rows.map((r) => r.method))).toEqual(new Set(['manual', 'google']));
    const googleEmails = rows.filter((r) => r.method === 'google').map((r) => r.email);
    expect(googleEmails.every((e) => e !== null)).toBe(true);
    expect(new Set(googleEmails).size).toBe(googleEmails.length); // unique
  });

  it('spreads createdAt over roughly the last 14 days, never in the future', () => {
    const rows = demoSignups(NOW);
    // "Roughly" 14 days: the day bucket plus a within-day hour offset, so allow one extra day of
    // slack on the upper bound rather than asserting an exact 14*24h ceiling.
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
    for (const r of rows) {
      expect(r.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(NOW.getTime() - r.createdAt.getTime()).toBeLessThanOrEqual(fifteenDaysMs);
    }
  });

  it('produces a realistic subset of join taps and matched teachers, not all-or-nothing', () => {
    const rows = demoSignups(NOW);
    const tapped = rows.filter((r) => r.joinTappedAt !== null).length;
    const matched = rows.filter((r) => r.teacherId !== null).length;
    expect(tapped).toBeGreaterThan(0);
    expect(tapped).toBeLessThan(40);
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThan(40);
  });
});

describe('demoFunnel / demoWebEvents', () => {
  it('is internally consistent with the 40-teacher seed', () => {
    const f = demoFunnel();
    expect(f.teachers).toBe(40);
    expect(f.onboarded).toBeLessThanOrEqual(f.teachers);
    expect(f.activated).toBeLessThanOrEqual(f.onboarded);
    expect(f.completedBoth).toBeLessThanOrEqual(f.activated);
  });

  it('web events funnel narrows: views > submits >= taps', () => {
    const w = demoWebEvents();
    expect(w['landing_view']!).toBeGreaterThan(w['signup_submitted']!);
    expect(w['signup_submitted']!).toBeGreaterThanOrEqual(w['join_tapped']!);
  });
});

describe('GET /api/admin/metrics under the demo token', () => {
  it('returns the seeded synthetic landing and funnel, leaving the real (empty) DB untouched', async () => {
    const app = createApp(deps());
    const res = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${DEMO}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('demo');
    expect(res.body.landing.signups).toBe(40);
    expect(res.body.funnel.teachers).toBe(40);
    expect(res.body.funnel.completedBoth).toBe(12);
  });

  it('the admin token still sees the real (empty in this test) data, untouched by the demo seed', async () => {
    const app = createApp(deps());
    const res = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    expect(res.body.landing.signups).toBe(0);
    expect(res.body.funnel.teachers).toBe(0);
  });
});

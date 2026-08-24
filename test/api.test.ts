import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';
import type { Signup } from '../src/domain/web.js';

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
    expect(webEvents.rows).toEqual([{ visitorId: 'v-1', name: 'signup_submitted', signupId: res.body.signupId, properties: { profession: 'school_teacher', method: 'manual' }, createdAt: now }]);
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
    const s = await signups.create({ name: 'M', profession: 'tutor', organization: null, phoneE164: '+919876543210', phoneRaw: 'x', city: 'Pune', country: 'IN', email: null, emailVerified: null, method: 'manual', source: null, now });
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
  it('204 logs cta_tapped with the where property (funnel: which CTA was tapped)', async () => {
    const { app, webEvents } = make();
    const res = await request(app).post('/api/events').send({ visitorId: 'v-c', name: 'cta_tapped', where: 'hero' });
    expect(res.status).toBe(204);
    expect(webEvents.rows).toEqual([{ visitorId: 'v-c', name: 'cta_tapped', signupId: null, properties: { where: 'hero' }, createdAt: now }]);
  });
  it('204 logs signup_view (reached the form) and signup_failed with a reason', async () => {
    const { app, webEvents } = make();
    expect((await request(app).post('/api/events').send({ visitorId: 'v-s', name: 'signup_view' })).status).toBe(204);
    expect((await request(app).post('/api/events').send({ visitorId: 'v-s', name: 'signup_failed', reason: 'validation' })).status).toBe(204);
    expect(webEvents.rows).toEqual([
      { visitorId: 'v-s', name: 'signup_view', signupId: null, properties: {}, createdAt: now },
      { visitorId: 'v-s', name: 'signup_failed', signupId: null, properties: { reason: 'validation' }, createdAt: now },
    ]);
  });
  it('400 for an out-of-set where value (client cannot write arbitrary properties)', async () => {
    const { app } = make();
    expect((await request(app).post('/api/events').send({ visitorId: 'v', name: 'cta_tapped', where: 'somewhere-else' })).status).toBe(400);
  });
});

describe('public error handler hardening', () => {
  class ThrowingSignupRepo extends InMemorySignupRepo {
    async create(): Promise<Signup> {
      throw new Error('db failed [42P01]: secret detail'); // shape of a real Supabase/PostgREST error
    }
  }
  class WeirdStatusSignupRepo extends InMemorySignupRepo {
    async create(): Promise<Signup> {
      throw Object.assign(new Error('weird upstream failure'), { status: 999 }); // out-of-range, twilio-RestException-shaped
    }
  }

  it('500 with a generic body when a repo call throws -- never echoes backend error detail', async () => {
    const { app } = make({ signups: new ThrowingSignupRepo() });
    const res = await request(app).post('/api/signup').send(valid);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
    expect(JSON.stringify(res.body)).not.toContain('42P01');
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });

  it('500 (not a crash) when the thrown error carries an out-of-range numeric status', async () => {
    const { app } = make({ signups: new WeirdStatusSignupRepo() });
    const res = await request(app).post('/api/signup').send(valid);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_error' });
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

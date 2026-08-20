import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import twilio from 'twilio'; // CJS: default import + destructure (matches src/adapters/twilio.ts, src/http/app.ts)
import { createApp, WEBHOOK_PATH, STATUS_PATH, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemoryTeacherRepo } from '../src/adapters/memory.js';
import type { InboundMessage } from '../src/domain/types.js';

const { getExpectedTwilioSignature } = twilio;

function makeDeps(over: Partial<AppDeps> = {}): { deps: AppDeps; inbound: InboundMessage[] } {
  const inbound: InboundMessage[] = [];
  const deps: AppDeps = {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: 'admin-secret', CRON_SECRET: 'cron-secret' },
    handleInbound: async (m) => { inbound.push(m); },
    runNudgePass: async () => 2,
    teachers: new InMemoryTeacherRepo(),
    events: new InMemoryEventLog(),
    clock: new FixedClock(new Date('2026-08-23T10:00:00Z')),
    ...over,
  };
  return { deps, inbound };
}
const form = { MessageSid: 'SM1', From: 'whatsapp:+911', To: 'whatsapp:+14155238886', Body: 'hi', WaId: '911', ProfileName: 'Meera', NumMedia: '0' };

describe('POST /webhooks/twilio/whatsapp', () => {
  it('ACKs with empty TwiML and dispatches the parsed inbound asynchronously', async () => {
    const { deps, inbound } = makeDeps();
    const res = await request(createApp(deps)).post(WEBHOOK_PATH).type('form').send(form);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<Response/>');
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0]).toEqual({ from: 'whatsapp:+911', waId: '911', profileName: 'Meera', body: 'hi', messageSid: 'SM1', buttonPayload: null, media: [] });
  });
  it('still ACKs 200 when the handler throws (never 500 to Twilio)', async () => {
    const { deps } = makeDeps({ handleInbound: async () => { throw new Error('boom'); } });
    const res = await request(createApp(deps)).post(WEBHOOK_PATH).type('form').send(form);
    expect(res.status).toBe(200);
  });
  it('parses media items from the Twilio form', async () => {
    const { deps, inbound } = makeDeps();
    await request(createApp(deps)).post(WEBHOOK_PATH).type('form').send({
      ...form, NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/SM1/Media/ME1', MediaContentType0: 'image/jpeg',
    });
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0].media).toEqual([{ url: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/SM1/Media/ME1', contentType: 'image/jpeg' }]);
  });
  it('M6: caps a forged/malformed NumMedia at 10 instead of looping unboundedly', async () => {
    const { deps, inbound } = makeDeps();
    const bigMedia: Record<string, string> = { NumMedia: '999' };
    for (let i = 0; i < 15; i++) {
      bigMedia[`MediaUrl${i}`] = `https://api.twilio.com/m/ME${i}`;
      bigMedia[`MediaContentType${i}`] = 'image/jpeg';
    }
    await request(createApp(deps)).post(WEBHOOK_PATH).type('form').send({ ...form, ...bigMedia });
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0].media).toHaveLength(10);
  });
  it('M6: a non-numeric NumMedia does not throw or produce media', async () => {
    const { deps, inbound } = makeDeps();
    await request(createApp(deps)).post(WEBHOOK_PATH).type('form').send({ ...form, NumMedia: 'not-a-number' });
    await vi.waitFor(() => expect(inbound).toHaveLength(1));
    expect(inbound[0].media).toEqual([]);
  });
});

describe('POST /webhooks/twilio/whatsapp — signature validation', () => {
  const PUBLIC_BASE_URL = 'https://x.test';
  const CONFIG_TOKEN = 'config-token-correct';
  const url = `${PUBLIC_BASE_URL}${WEBHOOK_PATH}`;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('validates using config.TWILIO_AUTH_TOKEN, not process.env.TWILIO_AUTH_TOKEN', async () => {
    // Ambient env deliberately WRONG: if the middleware silently fell back to it (the bug this
    // pins), a signature computed with the correct config token would then mismatch -> 403.
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'wrong-ambient-token-must-be-ignored');
    const { deps } = makeDeps({
      config: { TWILIO_AUTH_TOKEN: CONFIG_TOKEN, TWILIO_VALIDATE_SIGNATURE: true, PUBLIC_BASE_URL, ADMIN_TOKEN: 'admin-secret', CRON_SECRET: 'cron-secret' },
    });
    const signature = getExpectedTwilioSignature(CONFIG_TOKEN, url, form);
    const res = await request(createApp(deps)).post(WEBHOOK_PATH).set('X-Twilio-Signature', signature).type('form').send(form);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response/>');
  });

  it('rejects a bogus signature with 403 when validation is on', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', CONFIG_TOKEN); // ambient present but must not matter either way
    const { deps } = makeDeps({
      config: { TWILIO_AUTH_TOKEN: CONFIG_TOKEN, TWILIO_VALIDATE_SIGNATURE: true, PUBLIC_BASE_URL, ADMIN_TOKEN: 'admin-secret', CRON_SECRET: 'cron-secret' },
    });
    const res = await request(createApp(deps)).post(WEBHOOK_PATH).set('X-Twilio-Signature', 'bogus-signature').type('form').send(form);
    expect(res.status).toBe(403);
  });
});

describe('POST /webhooks/twilio/status', () => {
  it('returns 204', async () => {
    const { deps } = makeDeps();
    const res = await request(createApp(deps)).post(STATUS_PATH).type('form').send({ MessageSid: 'SM1', MessageStatus: 'failed', ErrorCode: '63016' });
    expect(res.status).toBe(204);
  });
});

describe('GET /admin/metrics', () => {
  it('401 without the bearer token, funnel JSON with it', async () => {
    const { deps } = makeDeps();
    const app = createApp(deps);
    expect((await request(app).get('/admin/metrics')).status).toBe(401);
    const res = await request(app).get('/admin/metrics').set('Authorization', 'Bearer admin-secret');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('teachers', 0);
    expect(res.body).toHaveProperty('eventCounts');
  });
});

describe('POST /internal/cron/nudges', () => {
  it('401 without the secret, {sent} with it', async () => {
    const { deps } = makeDeps();
    const app = createApp(deps);
    expect((await request(app).post('/internal/cron/nudges')).status).toBe(401);
    const res = await request(app).post('/internal/cron/nudges').set('x-cron-secret', 'cron-secret');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 2 });
  });
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const { deps } = makeDeps();
    const res = await request(createApp(deps)).get('/health');
    expect(res.body).toEqual({ ok: true });
  });
});

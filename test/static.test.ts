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

  it('reserved prefixes (/admin, /internal, /webhooks, /health, /api) must not render the app', async () => {
    const app = createApp(deps(FIXTURE));
    // Reserved prefixes with non-existent sub-paths must 404, not render HTML
    for (const p of ['/admin/does-not-exist', '/internal/does-not-exist', '/internal/cron/nudges', '/webhooks/does-not-exist', '/health/sub']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(404);
      expect(res.text, `${p} should not contain app HTML`).not.toContain('id="root"');
    }
    // But registered routes still answer
    expect((await request(app).get('/health')).body).toEqual({ ok: true });
    expect((await request(app).get('/admin/metrics')).status).toBe(401);
  });

  it('cache headers must be anchored to the served directory, not parent paths', async () => {
    const nestedDir = fileURLToPath(new URL('./fixtures/assets/web-dist', import.meta.url));
    const app = createApp(deps(nestedDir));
    // When the parent directory is literally named "assets", index.html must still be no-cache
    const index = await request(app).get('/');
    expect(index.status).toBe(200);
    expect(index.headers['cache-control']).toBe('no-cache');
    // And the hashed asset must still be immutable
    const asset = await request(app).get('/assets/app-def456.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('a truthy-but-missing build must degrade to API-only', async () => {
    const app = createApp(deps('/definitely/does/not/exist'));
    // Serves /health even though build is missing
    expect((await request(app).get('/health')).body).toEqual({ ok: true });
    // But the SPA fallback is not mounted
    expect((await request(app).get('/')).status).toBe(404);
  });
});

import { describe, it, expect } from 'vitest';
import { NON_SPA_ROUTES } from '../pwa.routes.ts';

describe('NON_SPA_ROUTES (service-worker navigation denylist)', () => {
  it.each(['/api', '/api/', '/api/signup', '/api?x=1', '/api/admin/metrics', '/webhooks/twilio/whatsapp', '/health', '/health?x', '/internal/cron/nudges'])('denies %s', (p) => {
    expect(NON_SPA_ROUTES.test(p)).toBe(true);
  });
  it.each(['/', '/index.html', '/join', '/joined', '/admin', '/apiary', '/healthy', '/administer', '/app/api', '/lessons/api'])('allows %s', (p) => {
    expect(NON_SPA_ROUTES.test(p)).toBe(false);
  });

  it('still covers the admin JSON, which now lives under /api', () => {
    // `admin` was deliberately removed from this list so /admin can be an SPA page. That is only
    // safe because the data it reads moved to /api/admin/metrics — if this ever stops matching,
    // an installed PWA would serve the app shell in place of the metrics JSON.
    expect(NON_SPA_ROUTES.test('/api/admin/metrics')).toBe(true);
    expect(NON_SPA_ROUTES.test('/api/admin/login')).toBe(true);
  });
});

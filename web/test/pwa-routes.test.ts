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

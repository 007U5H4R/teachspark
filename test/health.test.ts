import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemoryTeacherRepo } from '../src/adapters/memory.js';
import type { InboundMessage } from '../src/domain/types.js';
import { webDeps } from './helpers/web-deps.js';

function makeDeps(over: Partial<AppDeps> = {}): { deps: AppDeps; inbound: InboundMessage[] } {
  const inbound: InboundMessage[] = [];
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
  return { deps, inbound };
}

describe('GET /health', () => {
  it('returns 200 {ok:true}', async () => {
    const { deps } = makeDeps();
    const res = await request(createApp(deps)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

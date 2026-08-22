import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  ADMIN_COOKIE, clearCookie, isAuthorised, mintSession, readCookie, safeEqual, sessionCookie, SESSION_MS, verifySession,
} from '../src/http/adminAuth.js';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';

const SECRET = 'super-secret-token';
const NOW = 1_700_000_000_000;

function deps(): AppDeps {
  return {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: SECRET, CRON_SECRET: 'c' },
    handleInbound: async () => {}, runNudgePass: async () => 0,
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(),
    signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(),
    join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' },
    webDist: null, clock: new FixedClock(new Date(NOW)),
  };
}

describe('session tokens', () => {
  it('mints a session that verifies, and rejects it once expired', () => {
    const v = mintSession(NOW, SECRET, 1000);
    expect(verifySession(v, NOW, SECRET)).toBe(true);
    expect(verifySession(v, NOW + 999, SECRET)).toBe(true);
    expect(verifySession(v, NOW + 1001, SECRET)).toBe(false);
  });

  it('rejects a session signed with a different secret — rotating ADMIN_TOKEN is the revocation', () => {
    const v = mintSession(NOW, SECRET);
    expect(verifySession(v, NOW, 'rotated-token')).toBe(false);
  });

  it('cannot be forged by extending the expiry', () => {
    // The obvious attack: keep the signature, push the timestamp out.
    const v = mintSession(NOW, SECRET, 1000);
    const sig = v.slice(v.lastIndexOf('.') + 1);
    const forged = `${NOW + SESSION_MS * 10}.${sig}`;
    expect(verifySession(forged, NOW, SECRET)).toBe(false);
  });

  it.each(['', 'nodot', '.sig', 'abc.sig', '-1.sig', `${NOW + 1000}.`, '1e9.sig'])(
    'rejects the malformed value %j without throwing', (v) => {
      expect(verifySession(v, NOW, SECRET)).toBe(false);
    });

  it('safeEqual matches only identical strings, including different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false); // must not throw on a length mismatch
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('cookie handling', () => {
  it('reads one cookie out of a crowded header', () => {
    const h = `other=1; ${ADMIN_COOKIE}=abc.def; trailing=2`;
    expect(readCookie(h, ADMIN_COOKIE)).toBe('abc.def');
    expect(readCookie(h, 'missing')).toBeUndefined();
    expect(readCookie(undefined, ADMIN_COOKIE)).toBeUndefined();
  });

  it('keeps a value containing "=" intact', () => {
    // base64 padding would be truncated by a naive split('=').
    expect(readCookie(`${ADMIN_COOKIE}=aGVsbG8=`, ADMIN_COOKIE)).toBe('aGVsbG8=');
  });

  it('always sets HttpOnly and SameSite=Strict, and Secure only over https', () => {
    const insecure = sessionCookie('v', false, SESSION_MS);
    expect(insecure).toContain('HttpOnly');
    expect(insecure).toContain('SameSite=Strict');
    expect(insecure).not.toContain('Secure');       // local http dev must still work
    expect(sessionCookie('v', true, SESSION_MS)).toContain('Secure');
  });

  it('clears with Max-Age=0', () => {
    expect(clearCookie(true)).toContain('Max-Age=0');
  });
});

describe('isAuthorised', () => {
  it('accepts the bearer token or a valid cookie, and nothing else', () => {
    const cookieHeader = `${ADMIN_COOKIE}=${mintSession(NOW, SECRET)}`;
    expect(isAuthorised({ authorization: `Bearer ${SECRET}` }, NOW, SECRET)).toBe(true);
    expect(isAuthorised({ cookieHeader }, NOW, SECRET)).toBe(true);
    expect(isAuthorised({ authorization: `Bearer wrong` }, NOW, SECRET)).toBe(false);
    expect(isAuthorised({ cookieHeader: `${ADMIN_COOKIE}=nonsense` }, NOW, SECRET)).toBe(false);
    expect(isAuthorised({}, NOW, SECRET)).toBe(false);
  });
});

describe('POST /api/admin/login', () => {
  it('rejects a wrong token and sets no cookie', async () => {
    const res = await request(createApp(deps())).post('/api/admin/login').send({ token: 'nope' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers a malformed body exactly like a wrong token, leaking nothing about the shape', async () => {
    const app = createApp(deps());
    const bad = await request(app).post('/api/admin/login').send({ nottoken: 1 });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: 'unauthorized' });
  });

  it('sets an HttpOnly session cookie on success', async () => {
    const res = await request(createApp(deps())).post('/api/admin/login').send({ token: SECRET });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain(`${ADMIN_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('rate-limits repeated attempts, because ADMIN_TOKEN may be only 8 characters', async () => {
    const app = createApp(deps());
    let sawLimit = false;
    for (let i = 0; i < 14; i++) {
      const r = await request(app).post('/api/admin/login').send({ token: `guess-${i}` });
      if (r.status === 429) { sawLimit = true; break; }
    }
    expect(sawLimit).toBe(true);
  });
});

describe('GET /api/admin/metrics', () => {
  it('401s unauthenticated, and serves both acquisition paths when authorised', async () => {
    const app = createApp(deps());
    expect((await request(app).get('/api/admin/metrics')).status).toBe(401);

    const res = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('funnel.teachers');
    expect(res.body).toHaveProperty('landing.signups');
    expect(res.body).toHaveProperty('webEvents');
    expect(res.body).toHaveProperty('generatedAt');
  });

  it('accepts the cookie minted by login, so the browser never handles the raw token', async () => {
    const app = createApp(deps());
    const login = await request(app).post('/api/admin/login').send({ token: SECRET });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const res = await request(app).get('/api/admin/metrics').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('logout clears the cookie', async () => {
    const res = await request(createApp(deps())).post('/api/admin/logout');
    expect(res.status).toBe(200);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
  });
});

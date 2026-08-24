import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  ADMIN_COOKIE, authorisedRole, clearCookie, mintSession, readCookie, roleForToken, safeEqual, sessionCookie, SESSION_MS, verifySession,
} from '../src/http/adminAuth.js';
import { createApp, type AppDeps } from '../src/http/app.js';
import { FixedClock, InMemoryEventLog, InMemorySignupRepo, InMemoryTeacherRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';

const SECRET = 'super-secret-token';
const DEMO = 'demo-viewer-token';
const NOW = 1_700_000_000_000;

function deps(): AppDeps {
  return {
    config: { TWILIO_AUTH_TOKEN: 'tok', TWILIO_VALIDATE_SIGNATURE: false, PUBLIC_BASE_URL: 'https://x.test', ADMIN_TOKEN: SECRET, DEMO_TOKEN: DEMO, CRON_SECRET: 'c' },
    handleInbound: async () => {}, runNudgePass: async () => 0,
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(),
    signups: new InMemorySignupRepo(), webEvents: new InMemoryWebEventLog(),
    join: { url: 'https://wa.me/1?text=join%20x', code: 'x', whatsappNumber: '+1' },
    webDist: null, clock: new FixedClock(new Date(NOW)),
  };
}

describe('session tokens', () => {
  it('mints a session that verifies, and rejects it once expired', () => {
    const v = mintSession('admin', NOW, SECRET, 1000);
    expect(verifySession(v, NOW, SECRET)).toBe('admin');
    expect(verifySession(v, NOW + 999, SECRET)).toBe('admin');
    expect(verifySession(v, NOW + 1001, SECRET)).toBe(null);
  });

  it('rejects a session signed with a different secret — rotating ADMIN_TOKEN is the revocation', () => {
    const v = mintSession('admin', NOW, SECRET);
    expect(verifySession(v, NOW, 'rotated-token')).toBe(null);
  });

  it('cannot be forged by extending the expiry', () => {
    // The obvious attack: keep the signature, push the timestamp out.
    const v = mintSession('admin', NOW, SECRET, 1000);
    const sig = v.slice(v.lastIndexOf('.') + 1);
    const forged = `admin.${NOW + SESSION_MS * 10}.${sig}`;
    expect(verifySession(forged, NOW, SECRET)).toBe(null);
  });

  it.each(['', 'nodot', '.sig', 'admin.abc.sig', 'admin.-1.sig', `admin.${NOW + 1000}.`, 'admin.1e9.sig', `${NOW + 1000}.sig`, `root.${NOW + 1000}.sig`])(
    'rejects the malformed value %j without throwing', (v) => {
      expect(verifySession(v, NOW, SECRET)).toBe(null);
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

describe('authorisedRole', () => {
  const tokens = { adminToken: SECRET, demoToken: DEMO };

  it('accepts the bearer token or a valid cookie, and nothing else', () => {
    const cookieHeader = `${ADMIN_COOKIE}=${mintSession('admin', NOW, SECRET)}`;
    expect(authorisedRole({ authorization: `Bearer ${SECRET}` }, NOW, tokens)).toBe('admin');
    expect(authorisedRole({ cookieHeader }, NOW, tokens)).toBe('admin');
    expect(authorisedRole({ authorization: 'Bearer wrong' }, NOW, tokens)).toBe(null);
    expect(authorisedRole({ cookieHeader: `${ADMIN_COOKIE}=nonsense` }, NOW, tokens)).toBe(null);
    expect(authorisedRole({}, NOW, tokens)).toBe(null);
  });

  it('maps each token to its own role', () => {
    expect(roleForToken(SECRET, tokens)).toBe('admin');
    expect(roleForToken(DEMO, tokens)).toBe('demo');
    expect(roleForToken('neither', tokens)).toBe(null);
  });

  it('grants no demo role at all when DEMO_TOKEN is unset', () => {
    // An absent demo credential must not degrade into "any token works" or an empty-string match.
    const adminOnly = { adminToken: SECRET, demoToken: undefined };
    expect(roleForToken('', adminOnly)).toBe(null);
    expect(roleForToken(DEMO, adminOnly)).toBe(null);
    expect(roleForToken(SECRET, adminOnly)).toBe('admin');
  });

  it('a demo cookie cannot be edited into an admin one', () => {
    // The role is inside the signed payload; swapping the prefix breaks the signature.
    const demo = mintSession('demo', NOW, SECRET);
    expect(verifySession(demo, NOW, SECRET)).toBe('demo');
    const escalated = demo.replace(/^demo\./, 'admin.');
    expect(verifySession(escalated, NOW, SECRET)).toBe(null);
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

describe('demo role', () => {
  async function seeded(): Promise<AppDeps> {
    const d = deps();
    await d.signups.create({
      name: 'Meera Sharma', profession: 'school_teacher', organization: 'Kendriya Vidyalaya',
      phoneE164: '+919876543210', phoneRaw: '9876543210', city: 'Pune', country: 'IN',
      email: null, emailVerified: null, method: 'manual', source: 'linkedin', now: new Date(NOW),
    });
    return d;
  }

  it('logs in with the demo token and reports its role', async () => {
    const res = await request(createApp(await seeded())).post('/api/admin/login').send({ token: DEMO });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('demo');
  });

  it('is served a fixed synthetic dataset, not the real DB, so the pilot data is never exposed on a demo link', async () => {
    const app = createApp(await seeded());
    const res = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${DEMO}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('demo');
    // The real DB has exactly one seeded row (Pune); the demo role ignores it entirely and
    // always shows the deterministic 40-teacher synthetic dataset instead.
    expect(res.body.landing.signups).toBe(40);
    expect(res.body.funnel.teachers).toBe(40);
  });

  it('shows the synthetic fake names, carries no phone number, and never leaks the real DB row', async () => {
    const app = createApp(await seeded());
    const res = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${DEMO}`);
    const row = res.body.landing.recent[0];
    // The seed's fake-but-realistic name is shown as-is (it is not a real person), NOT the
    // "Teacher N" anonymiser label — the dataset is synthetic, so there is nothing to hide.
    expect(typeof row.name).toBe('string');
    expect(row.name.length).toBeGreaterThan(0);
    expect(row.name).not.toMatch(/^Teacher \d+$/);
    // The form no longer collects a phone (the bot gets the number from WhatsApp), so demo rows have none.
    expect(row.phone).toBeNull();
    // The real DB row (the seeded Pune/Meera Sharma sign-up) must never surface — demo ignores the
    // DB entirely. Match the FULL identifying strings, not substrings: the synthetic seed contains
    // unrelated fakes (e.g. a "Meera Joshi") that share a first name but are not the real person.
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Meera Sharma');
    expect(body).not.toContain('Kendriya Vidyalaya');
    expect(body).not.toContain('9876543210');
  });

  it('exposes no phone even with ?phones=full, and never leaks the real DB number', async () => {
    const app = createApp(await seeded());
    const res = await request(app).get('/api/admin/metrics?phones=full').set('Authorization', `Bearer ${DEMO}`);
    expect(res.body.landing.recent[0].phone).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('9876543210');
  });

  it('admin still sees everything, so the redaction is scoped to the role and not global', async () => {
    const app = createApp(await seeded());
    const res = await request(app).get('/api/admin/metrics?phones=full').set('Authorization', `Bearer ${SECRET}`);
    expect(res.body.landing.recent[0].name).toBe('Meera Sharma');
    expect(res.body.landing.recent[0].phone).toBe('+919876543210');
  });

  it('is refused by the deprecated /admin/metrics alias, which stays admin-only', async () => {
    const app = createApp(await seeded());
    expect((await request(app).get('/admin/metrics').set('Authorization', `Bearer ${DEMO}`)).status).toBe(401);
    expect((await request(app).get('/admin/metrics').set('Authorization', `Bearer ${SECRET}`)).status).toBe(200);
  });
});

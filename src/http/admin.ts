import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Clock, EventLog, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';
import { computeFunnel } from '../metrics/funnel.js';
import { computeLanding, countWebEvents } from '../metrics/landing.js';
import { demoFunnel, demoSignups, demoWebEvents } from '../metrics/demoSeed.js';
import { authorisedRole, clearCookie, mintSession, roleForToken, sessionCookie, SESSION_MS, type Role } from './adminAuth.js';

export interface AdminDeps {
  adminToken: string;
  demoToken?: string | undefined;
  events: EventLog;
  teachers: TeacherRepo;
  signups: SignupRepo;
  webEvents: WebEventLog;
  clock: Clock;
}

const LoginBody = z.object({ token: z.string().min(1).max(512) });

/**
 * Everything under /api/admin. Mounted BEFORE the general /api router so the /api 404 catch-all
 * cannot swallow it.
 */
export function createAdminRouter(deps: AdminDeps): express.Router {
  const router = express.Router();

  // ADMIN_TOKEN's floor is 8 characters, so an unlimited login endpoint is brute-forceable. This
  // is far tighter than the public API's limiter because nobody legitimately retries a paste.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'rate_limited' },
  });

  const tokens = { adminToken: deps.adminToken, demoToken: deps.demoToken };

  const roleOf = (req: Request): Role | null =>
    authorisedRole(
      { cookieHeader: req.headers.cookie, authorization: req.get('authorization') },
      deps.clock.now().getTime(),
      tokens,
    );

  router.post('/login', loginLimiter, (req: Request, res: Response) => {
    const parsed = LoginBody.safeParse(req.body);
    const role = parsed.success ? roleForToken(parsed.data.token, tokens) : null;
    // Deliberately the same response as a wrong token: a distinct "malformed" reply would tell an
    // attacker their request shape was right.
    if (!role) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // Signed with ADMIN_TOKEN whichever role it is, so one rotation revokes both.
    const value = mintSession(role, deps.clock.now().getTime(), deps.adminToken);
    res.setHeader('Set-Cookie', sessionCookie(value, req.secure, SESSION_MS));
    res.json({ ok: true, role });
  });

  router.post('/logout', (req: Request, res: Response) => {
    res.setHeader('Set-Cookie', clearCookie(req.secure));
    res.json({ ok: true });
  });

  /** Cheap probe so the SPA can tell "logged in" from "not" without pulling the whole payload. */
  router.get('/session', (req: Request, res: Response) => {
    const role = roleOf(req);
    res.json({ authenticated: role !== null, role });
  });

  router.get('/metrics', async (req: Request, res: Response) => {
    const role = roleOf(req);
    if (!role) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // Phones are masked by default so a normal page load never carries the contact list to the
    // browser. Asking for them in full is a deliberate act — and one the demo role never gets.
    const fullPhones = req.query.phones === 'full' && role === 'admin';

    // The demo role never touches the database at all: it is served a deterministic synthetic
    // dataset (src/metrics/demoSeed.ts) so the real pilot's data — and the graded funnel it
    // feeds — stay completely untouched by anything demo-related.
    if (role === 'demo') {
      res.json({
        role,
        funnel: demoFunnel(),
        landing: computeLanding(demoSignups(deps.clock.now()), { anonymise: true }),
        webEvents: demoWebEvents(),
        generatedAt: deps.clock.now().toISOString(),
      });
      return;
    }

    const [events, teachers, signups, webEvents] = await Promise.all([
      deps.events.listAll(),
      deps.teachers.listAll(),
      deps.signups.listAll(),
      deps.webEvents.listAll(),
    ]);
    res.json({
      role,
      funnel: computeFunnel(events, teachers),
      landing: computeLanding(signups, { fullPhones, anonymise: false }),
      webEvents: countWebEvents(webEvents),
      generatedAt: deps.clock.now().toISOString(),
    });
  });

  return router;
}

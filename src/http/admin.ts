import express, { type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Clock, EventLog, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';
import { computeFunnel } from '../metrics/funnel.js';
import { computeLanding, countWebEvents } from '../metrics/landing.js';
import { clearCookie, isAuthorised, mintSession, safeEqual, sessionCookie, SESSION_MS } from './adminAuth.js';

export interface AdminDeps {
  adminToken: string;
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

  const authed = (req: Request): boolean =>
    isAuthorised(
      { cookieHeader: req.headers.cookie, authorization: req.get('authorization') },
      deps.clock.now().getTime(),
      deps.adminToken,
    );

  router.post('/login', loginLimiter, (req: Request, res: Response) => {
    const parsed = LoginBody.safeParse(req.body);
    // Deliberately the same response as a wrong token: a distinct "malformed" reply would tell an
    // attacker their request shape was right.
    if (!parsed.success || !safeEqual(parsed.data.token, deps.adminToken)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const value = mintSession(deps.clock.now().getTime(), deps.adminToken);
    res.setHeader('Set-Cookie', sessionCookie(value, req.secure, SESSION_MS));
    res.json({ ok: true });
  });

  router.post('/logout', (req: Request, res: Response) => {
    res.setHeader('Set-Cookie', clearCookie(req.secure));
    res.json({ ok: true });
  });

  /** Cheap probe so the SPA can tell "logged in" from "not" without pulling the whole payload. */
  router.get('/session', (req: Request, res: Response) => {
    res.json({ authenticated: authed(req) });
  });

  router.get('/metrics', async (req: Request, res: Response) => {
    if (!authed(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    // Phones are masked by default so a normal page load never carries the contact list to the
    // browser. Asking for them in full is a deliberate act.
    const fullPhones = req.query.phones === 'full';
    const [events, teachers, signups, webEvents] = await Promise.all([
      deps.events.listAll(),
      deps.teachers.listAll(),
      deps.signups.listAll(),
      deps.webEvents.listAll(),
    ]);
    res.json({
      funnel: computeFunnel(events, teachers),
      landing: computeLanding(signups, { fullPhones }),
      webEvents: countWebEvents(webEvents),
      generatedAt: deps.clock.now().toISOString(),
    });
  });

  return router;
}

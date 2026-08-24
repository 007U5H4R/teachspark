import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Clock, SignupRepo, WebEventLog } from '../ports.js';
import { CLIENT_WEB_EVENTS, DuplicateSignupError, PROFESSIONS, SIGNUP_METHODS, WEB_EVENT, type Signup } from '../domain/web.js';
import { normalizePhone } from '../domain/phone.js';
import { COUNTRY_OPTIONS } from '../domain/countries.js';

export interface JoinInfo {
  url: string;            // wa.me deep link with the join text pre-filled
  code: string;           // sandbox join words, e.g. "captain-cheese" (shown as the manual fallback)
  whatsappNumber: string; // "+14155238886"
}

export interface ApiDeps {
  signups: SignupRepo;
  webEvents: WebEventLog;
  clock: Clock;
  join: JoinInfo;
}

const SignupBody = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  profession: z.enum(PROFESSIONS, { error: 'Please pick one' }),
  organization: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),           // now optional
  // Phone/country are no longer collected on the form; kept optional for back-compat and dedupe.
  phone: z.string().trim().min(4).max(32).optional(),
  country: z.string().trim().length(2).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
  emailVerified: z.boolean().optional(),
  method: z.enum(SIGNUP_METHODS).default('manual'),
  source: z.string().trim().max(64).optional(),
  visitorId: z.string().trim().max(64).optional(),
  website: z.string().optional(), // honeypot: real browsers never fill this (hidden field)
});

const EventBody = z.object({
  visitorId: z.string().trim().min(1).max(64),
  name: z.enum(CLIENT_WEB_EVENTS), // signup_submitted is logged server-side only (see CLIENT_WEB_EVENTS)
  signupId: z.uuid().optional(),
  // Small, explicitly-allowed context so the funnel can attribute a tap/failure. Kept to a closed
  // set rather than an open record so the client can't write arbitrary keys into web_events.
  where: z.enum(['hero', 'why', 'nav']).optional(), // which CTA fired cta_tapped
  reason: z.string().trim().max(40).optional(),      // why a signup_failed
});

function signupResponse(s: Signup, join: JoinInfo, existing: boolean) {
  return { signupId: s.id, existing, join };
}

export function createApiRouter(deps: ApiDeps): express.Router {
  const router = express.Router();

  // Generous general limit: a staff room behind one NAT IP must not lock itself out (3 calls per visit).
  router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } }));
  // Tighter on the write that stores PII.
  const signupLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' } });

  router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request', fields: z.flattenError(parsed.error).fieldErrors });
      return;
    }
    const b = parsed.data;
    if (b.website) {
      res.status(400).json({ error: 'bad_request' }); // honeypot tripped; say nothing useful to the bot
      return;
    }
    // Phone is optional now. Normalize + validate only when one was actually sent; a bad number
    // still 422s, but its absence is fine (the bot captures the real number from WhatsApp).
    let phoneE164: string | null = null;
    if (b.phone) {
      const phone = normalizePhone(b.phone, b.country ?? '');
      if ('error' in phone) {
        res.status(422).json({ error: 'invalid_phone' });
        return;
      }
      phoneE164 = phone.e164;
    }
    const email = b.email ?? null; // Zod already lowercased + validated the format
    const now = deps.clock.now();
    // Welcome-back on whichever dedupe key we have: phone if typed, else email.
    const existing = (phoneE164 && await deps.signups.findByPhoneE164(phoneE164))
      || (email && await deps.signups.findByEmail(email));
    if (existing) {
      res.status(200).json(signupResponse(existing, deps.join, true));
      return;
    }
    let signup: Signup;
    try {
      signup = await deps.signups.create({
        name: b.name,
        profession: b.profession,
        organization: b.organization ? b.organization : null,
        phoneE164,
        phoneRaw: b.phone ?? null,
        city: b.city ?? null,
        country: b.country ? b.country.toUpperCase() : null,
        email,
        emailVerified: b.emailVerified ?? null,
        method: b.method,
        source: b.source ?? null,
        now,
      });
    } catch (err) {
      if (err instanceof DuplicateSignupError) {
        res.status(200).json(signupResponse(err.existing, deps.join, true)); // lost a race with a double-submit
        return;
      }
      throw err;
    }
    await deps.webEvents.log({ visitorId: b.visitorId ?? null, name: WEB_EVENT.signup_submitted, signupId: signup.id, properties: { profession: b.profession, method: signup.method } }, now);
    res.status(201).json(signupResponse(signup, deps.join, false));
  });

  router.post('/events', async (req: Request, res: Response) => {
    const parsed = EventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const { visitorId, name, signupId, where, reason } = parsed.data;
    const now = deps.clock.now();
    if (name === WEB_EVENT.join_tapped) {
      if (!signupId) {
        res.status(400).json({ error: 'bad_request' });
        return;
      }
      if (!(await deps.signups.findById(signupId))) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      await deps.signups.markJoinTapped(signupId, now);
    }
    const properties: Record<string, string> = {};
    if (where) properties.where = where;
    if (reason) properties.reason = reason;
    await deps.webEvents.log({ visitorId, name, signupId: signupId ?? null, properties }, now);
    res.status(204).end();
  });

  router.get('/countries', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ countries: COUNTRY_OPTIONS });
  });

  return router;
}

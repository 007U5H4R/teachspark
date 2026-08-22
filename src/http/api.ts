import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Clock, SignupRepo, WebEventLog } from '../ports.js';
import { DuplicateSignupError, PROFESSIONS, WEB_EVENT, type Signup } from '../domain/web.js';
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
  phone: z.string().trim().min(4, 'Please enter your WhatsApp number').max(32),
  city: z.string().trim().min(2, 'Please enter your city').max(80),
  country: z.string().trim().length(2, 'Please pick a country'),
  source: z.string().trim().max(64).optional(),
  visitorId: z.string().trim().max(64).optional(),
  website: z.string().optional(), // honeypot: real browsers never fill this (hidden field)
});

const EventBody = z.object({
  visitorId: z.string().trim().min(1).max(64),
  name: z.enum([WEB_EVENT.landing_view, WEB_EVENT.join_tapped]), // signup_submitted is logged server-side only
  signupId: z.uuid().optional(),
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
    const phone = normalizePhone(b.phone, b.country);
    if ('error' in phone) {
      res.status(422).json({ error: 'invalid_phone' });
      return;
    }
    const now = deps.clock.now();
    const existing = await deps.signups.findByPhoneE164(phone.e164);
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
        phoneE164: phone.e164,
        phoneRaw: b.phone,
        city: b.city,
        country: b.country.toUpperCase(),
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
    await deps.webEvents.log({ visitorId: b.visitorId ?? null, name: WEB_EVENT.signup_submitted, signupId: signup.id, properties: { profession: b.profession, country: signup.country } }, now);
    res.status(201).json(signupResponse(signup, deps.join, false));
  });

  router.post('/events', async (req: Request, res: Response) => {
    const parsed = EventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const { visitorId, name, signupId } = parsed.data;
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
    await deps.webEvents.log({ visitorId, name, signupId: signupId ?? null }, now);
    res.status(204).end();
  });

  router.get('/countries', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ countries: COUNTRY_OPTIONS });
  });

  return router;
}

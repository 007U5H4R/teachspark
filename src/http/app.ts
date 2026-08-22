import express, { type NextFunction, type Request, type Response } from 'express';
import twilio from 'twilio'; // CJS: default import + destructure
import type { InboundMedia, InboundMessage } from '../domain/types.js';
import type { Clock, EventLog, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';
import type { Config } from '../config.js';
import { computeFunnel } from '../metrics/funnel.js';
import { createApiRouter, type JoinInfo } from './api.js';
import { createAdminRouter } from './admin.js';
import { safeEqual } from './adminAuth.js';
import { mountSpa } from './static.js';

const { webhook: twilioWebhook, twiml } = twilio;
const { MessagingResponse } = twiml;

export const WEBHOOK_PATH = '/webhooks/twilio/whatsapp';
export const STATUS_PATH = '/webhooks/twilio/status';

export interface AppDeps {
  config: Pick<Config, 'TWILIO_AUTH_TOKEN' | 'TWILIO_VALIDATE_SIGNATURE' | 'PUBLIC_BASE_URL' | 'ADMIN_TOKEN' | 'DEMO_TOKEN' | 'CRON_SECRET'>;
  handleInbound: (m: InboundMessage) => Promise<void>;
  runNudgePass: () => Promise<number>;
  teachers: TeacherRepo;
  events: EventLog;
  signups: SignupRepo;
  webEvents: WebEventLog;
  join: JoinInfo;
  webDist: string | null; // directory of the built SPA; null = API only (tests). Used from Task 5.
  clock: Clock;
}

type Form = Record<string, string | undefined>;

function parseInbound(body: Form): InboundMessage {
  const media: InboundMedia[] = [];
  // M6: NumMedia arrives as a string in the form body, attacker-controlled -- cap it so a forged
  // or malformed value can't drive an unbounded (or negative/NaN-guarded-away) loop.
  const numMedia = Math.min(Number(body.NumMedia) || 0, 10);
  for (let i = 0; i < numMedia; i++) {
    const url = body[`MediaUrl${i}`];
    const contentType = body[`MediaContentType${i}`];
    if (url && contentType) media.push({ url, contentType });
  }
  return {
    from: body.From ?? '',
    waId: body.WaId ?? null,
    profileName: body.ProfileName ?? null,
    body: body.Body ?? '',
    messageSid: body.MessageSid ?? '',
    buttonPayload: body.ButtonPayload ?? null,
    media,
  };
}

export function createApp(deps: AppDeps): express.Express {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // req.protocol === 'https' behind ngrok/Railway
  app.use(express.urlencoded({ extended: false })); // must run before twilio.webhook()
  // Order vs urlencoded is irrelevant: each parser only runs for its own Content-Type, so the
  // Twilio form webhook is untouched. 16kb is plenty for a sign-up form.
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post(
    WEBHOOK_PATH,
    twilioWebhook(config.TWILIO_AUTH_TOKEN, {
      validate: config.TWILIO_VALIDATE_SIGNATURE,
      url: `${config.PUBLIC_BASE_URL}${WEBHOOK_PATH}`,
    }),
    (req: Request, res: Response) => {
      // ACK inside Twilio's 15s window; do the real work off the request path.
      res.type('text/xml').status(200).send(new MessagingResponse().toString());
      const message = parseInbound((req.body ?? {}) as Form);
      if (!message.from) return;
      setImmediate(() => {
        void deps.handleInbound(message).catch((err) => console.error('[webhook] handler failed', err));
      });
    },
  );

  app.post(STATUS_PATH, (req: Request, res: Response) => {
    const b = (req.body ?? {}) as Form;
    if (b.MessageStatus === 'failed' || b.MessageStatus === 'undelivered') {
      console.warn(`[twilio-status] ${b.MessageSid} ${b.MessageStatus} error=${b.ErrorCode ?? '?'} to=${b.To ?? '?'}`);
    }
    res.status(204).end();
  });

  // DEPRECATED alias, kept for one release so docs/runbook.md and any monitoring do not break on
  // deploy day. The real endpoint is GET /api/admin/metrics, which lives under /api so the service
  // worker's denylist still covers it now that `admin` has been removed from that list.
  app.get('/admin/metrics', async (req: Request, res: Response) => {
    // safeEqual, not !==: a plain comparison short-circuits on the first differing byte, and this
    // token now also unlocks a login form on a public URL.
    // Alias keeps ADMIN-only semantics: the demo credential never reaches this legacy path.
    if (!safeEqual(req.get('authorization') ?? '', `Bearer ${config.ADMIN_TOKEN}`)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const [events, teachers] = await Promise.all([deps.events.listAll(), deps.teachers.listAll()]);
    res.json(computeFunnel(events, teachers));
  });

  app.post('/internal/cron/nudges', async (req: Request, res: Response) => {
    if (req.get('x-cron-secret') !== config.CRON_SECRET) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({ sent: await deps.runNudgePass() });
  });

  // BEFORE the general /api router: app.use('/api', …) also matches /api/admin/*, and when that
  // router does not handle the path it falls straight through to the /api 404 below.
  app.use('/api/admin', createAdminRouter({
    adminToken: config.ADMIN_TOKEN,
    demoToken: config.DEMO_TOKEN,
    events: deps.events,
    teachers: deps.teachers,
    signups: deps.signups,
    webEvents: deps.webEvents,
    clock: deps.clock,
  }));
  app.use('/api', createApiRouter({ signups: deps.signups, webEvents: deps.webEvents, clock: deps.clock, join: deps.join }));
  // JSON 404 for anything else under /api -- registered after the real routes. ('/api/*' throws in Express 5.)
  app.all('/api{/*splat}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  if (deps.webDist && !mountSpa(app, deps.webDist)) {
    console.warn(`[http] SPA build not found at ${deps.webDist}; serving API only`);
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // Only trust err.status for the 4xx range body-parser actually emits (e.g. entity.parse.failed
    // -> 400, entity.too.large -> 413). Anything else -- including a non-body-parser error that
    // happens to carry a numeric `status` (e.g. twilio's RestException), or an out-of-range value
    // like 0/999 that would otherwise throw ERR_HTTP_INVALID_STATUS_CODE -- is treated as a 500.
    const rawStatus = (err as { status?: unknown })?.status;
    const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500 ? rawStatus : 500;
    if (status >= 500) {
      console.error('[http] error', err);
    } else {
      console.warn('[http] error', req.method, req.path, status, err instanceof Error ? err.message : String(err));
    }
    // Never echo backend detail (e.g. Supabase/PostgREST error text) to anonymous /api/* clients.
    if (!res.headersSent) res.status(status).json({ error: status >= 500 ? 'server_error' : 'bad_request' });
  });

  return app;
}

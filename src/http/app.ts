import express, { type NextFunction, type Request, type Response } from 'express';
import twilio from 'twilio'; // CJS: default import + destructure
import type { InboundMedia, InboundMessage } from '../domain/types.js';
import type { Clock, EventLog, TeacherRepo } from '../ports.js';
import type { Config } from '../config.js';
import { computeFunnel } from '../metrics/funnel.js';

const { webhook: twilioWebhook, twiml } = twilio;
const { MessagingResponse } = twiml;

export const WEBHOOK_PATH = '/webhooks/twilio/whatsapp';
export const STATUS_PATH = '/webhooks/twilio/status';

export interface AppDeps {
  config: Pick<Config, 'TWILIO_AUTH_TOKEN' | 'TWILIO_VALIDATE_SIGNATURE' | 'PUBLIC_BASE_URL' | 'ADMIN_TOKEN' | 'CRON_SECRET'>;
  handleInbound: (m: InboundMessage) => Promise<void>;
  runNudgePass: () => Promise<number>;
  teachers: TeacherRepo;
  events: EventLog;
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

  app.get('/admin/metrics', async (req: Request, res: Response) => {
    if (req.get('authorization') !== `Bearer ${config.ADMIN_TOKEN}`) {
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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[http] error', err);
    if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' });
  });

  return app;
}

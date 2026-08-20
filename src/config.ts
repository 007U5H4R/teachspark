import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z
    .url()
    .refine((u) => !u.endsWith('/'), { error: 'PUBLIC_BASE_URL must not have a trailing slash' }),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_WHATSAPP_FROM: z.string().startsWith('whatsapp:+').default('whatsapp:+14155238886'),
  TWILIO_SANDBOX_JOIN_CODE: z.string().min(1),
  TWILIO_VALIDATE_SIGNATURE: z.stringbool().default(true),
  ANTHROPIC_API_KEY: z.string().min(1),
  WORKSHEET_MODEL: z.string().min(1).default('claude-sonnet-5'),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_PDF_BUCKET: z.string().min(1).default('worksheets'),
  ADMIN_TOKEN: z.string().min(8),
  CRON_SECRET: z.string().min(8),
  NUDGE_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),
  NUDGE_CRON: z.string().min(1).default('*/10 * * * *'),
  SUPABASE_PAPER_BUCKET: z.string().min(1).default('papers'),
  PAPER_MODEL: z.string().min(1).default('claude-sonnet-5'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** wa.me deep link that pre-fills the sandbox join message. */
export function buildJoinLink(whatsappFrom: string, joinCode: string): string {
  const digits = whatsappFrom.replace(/^whatsapp:\+/, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(`join ${joinCode}`)}`;
}

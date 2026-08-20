import { loadConfig, buildJoinLink } from './config.js';
import { createApp } from './http/app.js';
import { createInboundHandler } from './bot/handle.js';
import { createNudgePass, startNudgeCron } from './jobs/nudges.js';
import type { ExecutorDeps } from './bot/executor.js';
import { SystemClock } from './adapters/memory.js';
import { createSupabase, SupabaseEventLog, SupabaseGenerationStore, SupabaseTeacherRepo, SupabasePapersRepo } from './adapters/supabase.js';
import { AnthropicGenerator } from './adapters/anthropic.js';
import { PdfkitBuilder } from './adapters/pdf.js';
import { SupabasePdfStore, ensurePublicBucket, SupabasePaperStore, PAPER_BUCKET_MIME_TYPES } from './adapters/storage.js';
import { TwilioMessenger } from './adapters/twilio.js';
import { TwilioMediaFetcher } from './adapters/media.js';
import { AnthropicPaperGenerator } from './adapters/anthropic-paper.js';
import { DocxPaperBuilder } from './adapters/docx.js';
import { STATUS_PATH } from './http/app.js';

const config = loadConfig();
const sb = createSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

const deps: ExecutorDeps = {
  teachers: new SupabaseTeacherRepo(sb),
  events: new SupabaseEventLog(sb),
  generations: new SupabaseGenerationStore(sb),
  messenger: new TwilioMessenger({
    accountSid: config.TWILIO_ACCOUNT_SID,
    authToken: config.TWILIO_AUTH_TOKEN,
    from: config.TWILIO_WHATSAPP_FROM,
    statusCallbackUrl: `${config.PUBLIC_BASE_URL}${STATUS_PATH}`,
  }),
  generator: new AnthropicGenerator({ apiKey: config.ANTHROPIC_API_KEY, model: config.WORKSHEET_MODEL }),
  pdfBuilder: new PdfkitBuilder(),
  pdfStore: new SupabasePdfStore(sb, config.SUPABASE_PDF_BUCKET),
  mediaFetcher: new TwilioMediaFetcher({ accountSid: config.TWILIO_ACCOUNT_SID, authToken: config.TWILIO_AUTH_TOKEN }),
  paperGenerator: new AnthropicPaperGenerator({ apiKey: config.ANTHROPIC_API_KEY, model: config.PAPER_MODEL }),
  docBuilder: new DocxPaperBuilder(),
  paperStore: new SupabasePaperStore(sb, config.SUPABASE_PAPER_BUCKET),
  papers: new SupabasePapersRepo(sb),
  clock: new SystemClock(),
  joinLink: buildJoinLink(config.TWILIO_WHATSAPP_FROM, config.TWILIO_SANDBOX_JOIN_CODE),
  timezone: config.NUDGE_TIMEZONE,
};

const runNudgePass = createNudgePass(deps);
const app = createApp({ config, handleInbound: createInboundHandler(deps), runNudgePass, teachers: deps.teachers, events: deps.events, clock: deps.clock });

const server = app.listen(config.PORT, '0.0.0.0', (err?: Error) => {
  if (err) throw err;
  console.log(`teachspark listening on :${config.PORT} (${config.NODE_ENV})`);
  console.log(`join link: ${deps.joinLink}`);
});

// Non-fatal and non-blocking: /health must come up even if Supabase storage hiccups on a cold
// start. A missing/unreachable bucket only degrades PDF delivery -- storeWorksheetPdf failing is
// already caught in the executor (pdfUrl: null), so the worksheet TEXT still goes out either way.
ensurePublicBucket(sb, config.SUPABASE_PDF_BUCKET).catch((err) => {
  console.error('[boot] ensurePublicBucket failed; PDF delivery may be degraded until it succeeds', err);
});

// Same non-fatal, non-blocking pattern as the PDF bucket above: a missing/unreachable papers
// bucket only degrades paper delivery -- runPaperRender's docx upload failure is already caught
// in the executor (apology + IDLE), so /health and the rest of the bot are unaffected.
ensurePublicBucket(sb, config.SUPABASE_PAPER_BUCKET, PAPER_BUCKET_MIME_TYPES).catch((err) => {
  console.error('[boot] ensurePublicBucket (papers) failed; paper delivery may be degraded until it succeeds', err);
});

const cronHandle = startNudgeCron(runNudgePass, config.NUDGE_CRON, config.NUDGE_TIMEZONE);

function shutdown(signal: string) {
  console.log(`received ${signal}, shutting down`);
  cronHandle.stop();
  // Drain a sweep already mid-flight before closing the server, so a process kill can never land
  // between a successful Twilio send and its paired nudgeSentAt write (which would double-send on
  // restart). The 5s hard-exit below still bounds this -- a stuck sweep can't block shutdown forever.
  void runNudgePass.whenIdle().finally(() => server.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

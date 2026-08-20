/**
 * Phase 4 QA gate (independent of the implementers).
 *
 * Case 2 — supertest END-TO-END: the REAL Express app + the REAL inbound handler + the REAL
 *          executor + the REAL state machine + the REAL nudge sweep, wired over in-memory fakes
 *          only. Nothing about the conversation logic is mocked; only the four I/O edges
 *          (Twilio, Anthropic, Supabase rows, Supabase Storage) are fakes. Zero live side effects.
 * Case 3 — failure injection at each of those edges: every one must degrade gracefully and the
 *          webhook must still ACK 200 so Twilio never retries.
 * Case 5 — security: the two shared-secret endpoints and Twilio signature validation.
 *
 * Helpers are copied (not imported) from test/app.test.ts and test/handle.test.ts on purpose:
 * a QA suite must not break when another suite's helpers change.
 *
 * NOTE on the async webhook: createApp ACKs 200 immediately and dispatches via setImmediate,
 * which is never awaited. Every POST below therefore goes through `post()`, which waits for the
 * handler to actually settle before the test asserts on any side effect.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import twilio from 'twilio'; // CJS: default import + destructure
import { createApp, WEBHOOK_PATH, type AppDeps } from '../src/http/app.js';
import { createInboundHandler } from '../src/bot/handle.js';
import { createNudgePass } from '../src/jobs/nudges.js';
import type { ExecutorDeps } from '../src/bot/executor.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import { MAX_CHUNK } from '../src/bot/machine.js';
import type { Teacher } from '../src/domain/types.js';

const { getExpectedTwilioSignature } = twilio;

const NOW = new Date('2026-08-23T14:00:00+05:30');
const FROM = 'whatsapp:+919812345678';
const WA_ID = '919812345678';
const AUTH_TOKEN = 'qa-twilio-auth-token';
const BASE_URL = 'https://qa.teachspark.test';
const ADMIN_TOKEN = 'qa-admin-token';
const CRON_SECRET = 'qa-cron-secret';
const JOIN = 'https://wa.me/14155238886?text=join%20captain-cheese';
const TZ = 'Asia/Kolkata';
const STEP_MS = 30_000;

/** A realistic model response: long enough that chunkText MUST split it, so the <=1500 assertion has teeth. */
const MODEL_TEXT = [
  'TITLE: Comparing Fractions with Unlike Denominators',
  '',
  'LEVEL 1 - SUPPORT',
  '1. Which is greater: 1/2 or 1/4? Draw two equal bars and shade them to check.',
  '2. Write >, < or = between 3/5 and 3/8.',
  '3. Convert 1/2 into eighths. Then compare it with 3/8.',
  '4. Circle the smaller fraction in each pair: (a) 2/3 and 2/7 (b) 5/6 and 5/9.',
  '5. Arrange in increasing order: 1/2, 1/3, 1/6.',
  '',
  'LEVEL 2 - ON LEVEL',
  '1. Compare 3/4 and 5/6 by first making the denominators the same.',
  '2. Compare 7/10 and 2/3 using the LCM of 10 and 3.',
  '3. Arrange in decreasing order: 2/3, 3/5, 7/15, 4/5.',
  '4. Rani ate 3/8 of a pizza and Sameer ate 2/5 of an equal pizza. Who ate more?',
  '5. Write one fraction that lies between 1/3 and 1/2.',
  '',
  'LEVEL 3 - CHALLENGE',
  '1. Without finding the LCM, explain why 11/12 is greater than 9/10.',
  '2. Two taps fill 5/9 and 7/12 of a tank in one hour. Which tap is faster, and by how much?',
  '3. Arrange 5/7, 7/9, 9/11 in increasing order and explain the pattern you notice.',
  '4. Find two different fractions that lie between 4/7 and 5/7.',
  '5. A recipe needs 2/3 cup of milk. Meera has 5/8 cup. Does she have enough? Justify your answer.',
  '6. Priya says 3/7 is greater than 4/9 because 7 is smaller than 9. Explain her mistake in one sentence.',
  '',
  'ANSWER KEY',
  'Level 1: 1) 1/2  2) >  3) 1/2 = 4/8, so 1/2 > 3/8  4) (a) 2/7 (b) 5/9  5) 1/6, 1/3, 1/2',
  'Level 2: 1) 5/6  2) 7/10  3) 4/5, 2/3, 3/5, 7/15  4) Sameer, 2/5 = 16/40 and 3/8 = 15/40  5) 5/12',
  'Level 3: 1) 11/12 is 1/12 short of 1 and 9/10 is 1/10 short, and 1/12 < 1/10  2) the 7/12 tap, by 1/36 of the tank  3) 5/7, 7/9, 9/11  4) 33/56 and 34/56  5) no, 5/8 = 15/24 and 2/3 = 16/24  6) a smaller denominator only means larger parts when the numerators match, and here they do not',
].join('\n');

interface Harness {
  app: ReturnType<typeof createApp>;
  clock: FixedClock;
  teachers: InMemoryTeacherRepo;
  events: InMemoryEventLog;
  generations: InMemoryGenerationStore;
  messenger: FakeMessenger;
  generator: FakeGenerator;
  pdfStore: FakePdfStore;
  /** POST a Twilio-style inbound form, then wait until the async handler has fully settled. */
  post(body: string): Promise<{ status: number; text: string; contentType: string }>;
  teacher(): Promise<Teacher>;
}

function harness(opts: { validateSignature?: boolean } = {}): Harness {
  const clock = new FixedClock(NOW);
  const teachers = new InMemoryTeacherRepo();
  const events = new InMemoryEventLog();
  const generations = new InMemoryGenerationStore();
  const messenger = new FakeMessenger();
  const generator = new FakeGenerator(MODEL_TEXT);
  const pdfStore = new FakePdfStore();
  const exec: ExecutorDeps = {
    teachers, events, generations, messenger, generator,
    pdfBuilder: new FakePdfBuilder(), pdfStore, clock, joinLink: JOIN, timezone: TZ,
  };

  const realHandler = createInboundHandler(exec); // the REAL handler, not a spy
  let settled = 0;
  const handleInbound = async (m: Parameters<typeof realHandler>[0]): Promise<void> => {
    try {
      await realHandler(m);
    } finally {
      settled += 1;
    }
  };

  const config: AppDeps['config'] = {
    TWILIO_AUTH_TOKEN: AUTH_TOKEN,
    TWILIO_VALIDATE_SIGNATURE: opts.validateSignature ?? false,
    PUBLIC_BASE_URL: BASE_URL,
    ADMIN_TOKEN,
    CRON_SECRET,
  };
  const app = createApp({ config, handleInbound, runNudgePass: createNudgePass(exec), teachers, events, clock });

  let n = 0;
  async function post(body: string) {
    const target = ++n;
    clock.advance(STEP_MS); // a human types every 30s
    const res = await request(app).post(WEBHOOK_PATH).type('form').send({
      From: FROM, WaId: WA_ID, ProfileName: 'Meera', Body: body, MessageSid: `SM${target}`,
      To: 'whatsapp:+14155238886', NumMedia: '0',
    });
    await vi.waitFor(() => expect(settled).toBe(target), { timeout: 5_000, interval: 5 });
    return { status: res.status, text: res.text, contentType: String(res.headers['content-type'] ?? '') };
  }

  async function teacher(): Promise<Teacher> {
    const t = await teachers.findByWaFrom(FROM);
    if (!t) throw new Error('teacher not found');
    return t;
  }

  return { app, clock, teachers, events, generations, messenger, generator, pdfStore, post, teacher };
}

const TOPIC = 'Comparing fractions with unlike denominators';
/** Hi -> grade 2 -> subject 1 -> board 1 -> topic -> impact 2 -> referral 1 */
const FUNNEL = ['Hi', '2', '1', '1', TOPIC, '2', '1'];

// ---------------------------------------------------------------------------
// Case 2 — supertest end-to-end over the whole stack
// ---------------------------------------------------------------------------
describe('QA Case 2 — end-to-end funnel over HTTP (app + handler + executor + machine)', () => {
  interface Driven {
    h: Harness;
    acks: Array<{ status: number; text: string; contentType: string }>;
    teacher: Teacher;
    eventNames: string[];
    eventCount: number;
    texts: string[];
    documents: string[];
  }

  async function drive(): Promise<Driven> {
    const h = harness();
    const acks = [];
    for (const body of FUNNEL) acks.push(await h.post(body));
    return {
      h, acks,
      teacher: await h.teacher(),
      eventNames: h.events.names(),
      eventCount: h.events.rows.length,
      texts: h.messenger.texts(),
      documents: h.messenger.sent.filter((s) => s.kind === 'document').map((s) => s.url ?? ''),
    };
  }

  it('(a) every inbound POST is ACKed 200 with empty TwiML inside Twilio\'s window', async () => {
    const { acks } = await drive();
    expect(acks).toHaveLength(7);
    for (const a of acks) {
      expect(a.status).toBe(200);
      expect(a.contentType).toContain('xml');
      expect(a.text).toContain('<Response/>');
    }
  });

  it('(b) lands the teacher IDLE with the worksheet skill completed', async () => {
    const { teacher } = await drive();
    expect(teacher.state).toBe('IDLE');
    expect(teacher.skillsCompleted).toEqual(['worksheet']);
    expect(teacher.currentSkillId).toBeNull();
    expect(teacher.pendingTopic).toBeNull();
    expect(teacher.grade).toBe('Middle (Classes 6-8)');
    expect(teacher.subject).toBe('Maths');
    expect(teacher.board).toBe('CBSE');
    expect(teacher.activatedAt).not.toBeNull();
    expect(teacher.nudgeDueAt).not.toBeNull();
    expect(teacher.nudgeSentAt).toBeNull();
  });

  it('(c) logs at least 18 events, covering the whole PRD funnel', async () => {
    const { eventCount, eventNames } = await drive();
    expect(eventCount).toBeGreaterThanOrEqual(18);
    expect(eventNames).toEqual(expect.arrayContaining([
      EVENT.session_started, EVENT.message_received, EVENT.welcome_sent, EVENT.grade_captured,
      EVENT.subject_captured, EVENT.board_captured, EVENT.onboarding_completed, EVENT.microlesson_sent,
      EVENT.topic_provided, EVENT.generation_started, EVENT.generation_succeeded, EVENT.worksheet_delivered,
      EVENT.pdf_delivered, EVENT.reusable_prompt_sent, EVENT.impact_prompt_sent, EVENT.activated,
      EVENT.impact_reported, EVENT.referral_reported, EVENT.skill_completed, EVENT.share_cta_sent,
      EVENT.nudge_scheduled,
    ]));
    expect(eventNames).not.toContain(EVENT.error_occurred);
    expect(eventNames).not.toContain(EVENT.generation_failed);
    expect(eventNames).not.toContain(EVENT.pdf_failed);
  });

  it('(d) every outbound text is within the 1500-char WhatsApp limit', async () => {
    const { texts } = await drive();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((t) => t.length > MAX_CHUNK)).toEqual([]);
    expect(MAX_CHUNK).toBe(1500);
    // the fixture really is long enough to have been split, so the limit was actually exercised
    expect(MODEL_TEXT.length).toBeGreaterThan(MAX_CHUNK);
    expect(texts.filter((t) => t.includes('LEVEL 1 - SUPPORT') || t.includes('ANSWER KEY')).length).toBeGreaterThanOrEqual(2);
  });

  it('(e) delivers the PDF as a document alongside the worksheet text', async () => {
    const { documents, texts, h } = await drive();
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatch(/\.pdf$/);
    expect(h.pdfStore.stored).toHaveLength(1);
    expect(h.pdfStore.stored[0].bytes).toBeGreaterThan(0);
    expect(h.generations.saved).toHaveLength(1);
    expect(h.generations.saved[0].pdfUrl).toBe(documents[0]);
    // and the human-visible payload is all there
    expect(texts.some((t) => t.includes('AI can make mistakes'))).toBe(true);
    expect(texts.some((t) => t.includes('Keep the skill, not just the sheet'))).toBe(true);
    expect(texts.at(-1)).toContain(JOIN);
  });

  it('(f) a due nudge sweep via POST /internal/cron/nudges reports {sent:1} and reopens skill 2', async () => {
    const { h } = await drive();
    const before = await h.teacher();

    // Overnight: the real nudge is scheduled NUDGE_DELAY_HOURS (20h) after her last inbound, so the
    // sweep must run well after it. (Sweeping in the same millisecond as her last message would make
    // machine.ts's strict `lastInboundAt < nudgeSentAt` test false and suppress nudge_reopened --
    // unreachable in production, but it would make this test lie.)
    h.clock.advance(20 * 3_600_000);
    // force the nudge due (the pilot's real trigger is a Supabase UPDATE; here it is the fake repo)
    await h.teachers.update(before.id, { nudgeDueAt: new Date(h.clock.now().getTime() - 60_000) });

    const res = await request(h.app).post('/internal/cron/nudges').set('x-cron-secret', CRON_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 1 });

    const nudged = await h.teacher();
    expect(nudged.state).toBe('AWAITING_TOPIC');
    expect(nudged.currentSkillId).toBe('quiz');
    expect(nudged.nudgeSentAt).not.toBeNull();
    expect(nudged.nudgeCount).toBe(1);
    expect(h.events.names()).toContain(EVENT.nudge_sent);
    expect(h.messenger.texts().at(-1)).toContain('exit ticket');

    // ...and she can actually continue into skill 2 from there
    await h.post('Photosynthesis: inputs and outputs');
    const working = await h.teacher();
    expect(working.state).toBe('AWAITING_IMPACT');
    expect(h.events.names()).toContain(EVENT.nudge_reopened);
    expect(h.generator.calls.map((c) => c.skillId)).toEqual(['worksheet', 'quiz']);
    expect(h.generator.calls[1].topic).toBe('Photosynthesis: inputs and outputs');

    // finishing skill 2 completes both and schedules no further nudge
    await h.post('3');
    await h.post('2');
    const done = await h.teacher();
    expect(done.state).toBe('IDLE');
    expect(done.skillsCompleted).toEqual(['worksheet', 'quiz']);
    expect(h.messenger.texts().filter((t) => t.length > MAX_CHUNK)).toEqual([]);
  });

  it('(g) /admin/metrics reports the funnel for the walked conversation', async () => {
    const { h } = await drive();
    const res = await request(h.app).get('/admin/metrics').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      teachers: 1, onboarded: 1, activated: 1, impactReported: 1,
      completedBoth: 0, medianMinutesSaved: 30, referredCount: 1,
    });
    expect(res.body.eventCounts[EVENT.worksheet_delivered]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — failure injection at each I/O edge
// ---------------------------------------------------------------------------
describe('QA Case 3 — failure injection: every edge degrades gracefully', () => {
  it('(a) Twilio 63016 (outside the 24h window): no crash, error_occurred logged, still ACKs 200', async () => {
    const h = harness();
    h.messenger.failWith = 63016;

    const first = await h.post('Hi');
    const second = await h.post('2');

    expect([first.status, second.status]).toEqual([200, 200]); // Twilio must never see a retryable error
    expect(h.messenger.sent).toEqual([]); // nothing was actually delivered
    const errors = h.events.rows.filter((r) => r.name === EVENT.error_occurred);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors[0].properties).toMatchObject({ action: 'send_text', errorCode: 63016 });
    // the conversation state still advanced, so nothing is lost once she re-joins the sandbox
    expect((await h.teacher()).state).toBe('AWAITING_SUBJECT');

    // and delivery resumes the moment Twilio recovers
    h.messenger.failWith = null;
    await h.post('1');
    expect(h.messenger.texts()).toHaveLength(1);
    expect((await h.teacher()).state).toBe('AWAITING_BOARD');
  });

  it('(a2) a Twilio send that THROWS is treated like a failed send, not a crashed step', async () => {
    const h = harness();
    h.messenger.throwWith = new Error('ECONNRESET');
    const res = await h.post('Hi');
    expect(res.status).toBe(200);
    expect(h.events.names()).toContain(EVENT.error_occurred);
    expect((await h.teacher()).state).toBe('AWAITING_GRADE');
  });

  it('(b) Anthropic down: apology + back to AWAITING_TOPIC, generation_failed logged', async () => {
    const h = harness();
    for (const body of ['Hi', '2', '1', '1']) await h.post(body);
    h.generator.failWith = new Error('api down');

    const res = await h.post(TOPIC);
    expect(res.status).toBe(200);

    const t = await h.teacher();
    expect(t.state).toBe('AWAITING_TOPIC'); // she is invited to try again, not stranded in GENERATING
    expect(t.pendingTopic).toBeNull();
    expect(t.retries).toBe(0);

    const names = h.events.names();
    expect(names).toContain(EVENT.generation_started);
    expect(names).toContain(EVENT.generation_failed);
    expect(names).not.toContain(EVENT.generation_succeeded);
    const failed = h.events.rows.find((r) => r.name === EVENT.generation_failed);
    expect(failed?.properties).toMatchObject({ reason: 'error' });
    expect(failed?.skillId).toBe('worksheet');
    // the underlying cause is captured too
    expect(h.events.rows.find((r) => r.name === EVENT.error_occurred)?.properties)
      .toMatchObject({ where: 'generate', message: 'api down' });

    // teacher-visible apology
    expect(h.messenger.texts().at(-1)).toContain("Sorry, that one didn't work");
    expect(h.messenger.sent.some((s) => s.kind === 'document')).toBe(false);

    // and a retry after the API recovers succeeds
    h.generator.failWith = null;
    await h.post(TOPIC);
    expect((await h.teacher()).state).toBe('AWAITING_IMPACT');
    expect(h.events.names()).toContain(EVENT.generation_succeeded);
  });

  it('(c) Supabase Storage down: the worksheet TEXT still lands, pdf_failed logged, no PDF cost to her', async () => {
    const h = harness();
    for (const body of ['Hi', '2', '1', '1']) await h.post(body);
    h.pdfStore.failWith = new Error('bucket down');

    const res = await h.post(TOPIC);
    expect(res.status).toBe(200);

    const names = h.events.names();
    expect(names).toContain(EVENT.generation_succeeded); // a billed, successful model call is NOT demoted
    expect(names).toContain(EVENT.worksheet_delivered);
    expect(names).toContain(EVENT.pdf_failed);
    expect(names).not.toContain(EVENT.pdf_delivered);

    const texts = h.messenger.texts();
    expect(texts.some((t) => t.includes('LEVEL 1 - SUPPORT'))).toBe(true); // she still gets the worksheet
    expect(texts.some((t) => t.includes('ANSWER KEY'))).toBe(true);
    expect(texts.some((t) => t.includes('The PDF could not be made this time'))).toBe(true);
    expect(texts.filter((t) => t.length > MAX_CHUNK)).toEqual([]);
    expect(h.messenger.sent.some((s) => s.kind === 'document')).toBe(false);

    // the funnel continues normally: she is asked for impact and can finish the skill
    expect((await h.teacher()).state).toBe('AWAITING_IMPACT');
    expect(h.generations.saved[0].pdfUrl).toBeNull();
    await h.post('2');
    await h.post('1');
    expect((await h.teacher()).skillsCompleted).toEqual(['worksheet']);
  });

  it('(d2) a generations.save failure still delivers the worksheet — but silently drops generation_succeeded', async () => {
    // Pins the CARRIED-FORWARD deferred item: the save failure is console-only, and because the
    // generation_succeeded log sits inside the same try block it is skipped too, so /admin/metrics
    // under-counts successes relative to worksheet_delivered. Delivery itself is correctly unaffected.
    const h = harness();
    for (const body of ['Hi', '2', '1', '1']) await h.post(body);
    h.generations.failWith = new Error('generations table down');

    const res = await h.post(TOPIC);
    expect(res.status).toBe(200);

    const names = h.events.names();
    expect(names).toContain(EVENT.worksheet_delivered); // she still gets everything
    expect(names).toContain(EVENT.pdf_delivered);
    expect(names).not.toContain(EVENT.generation_succeeded); // <- the documented gap
    expect(names).not.toContain(EVENT.generation_failed); // and it is NOT demoted to a failure
    expect(names).not.toContain(EVENT.error_occurred); // nothing lands in the events table at all
    expect(h.messenger.sent.some((s) => s.kind === 'document')).toBe(true);
    expect((await h.teacher()).state).toBe('AWAITING_IMPACT');
  });

  it('(d) the events table going down never blocks the reply or the ACK', async () => {
    const h = harness();
    h.events.log = async () => { throw new Error('events table down'); };
    const res = await h.post('Hi');
    expect(res.status).toBe(200);
    // the handler catches, tries to log (also fails, swallowed) and still apologises to her
    expect(h.messenger.texts().at(-1)).toContain('Something went wrong');
  });
});

// ---------------------------------------------------------------------------
// Case 5 — security
// ---------------------------------------------------------------------------
describe('QA Case 5 — security', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('(a) GET /admin/metrics: 401 with no credential, 401 with a wrong one, 200 with the right Bearer', async () => {
    const h = harness();
    const none = await request(h.app).get('/admin/metrics');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: 'unauthorized' });

    for (const bad of ['Bearer wrong-token', `Bearer ${ADMIN_TOKEN}x`, ADMIN_TOKEN, 'Basic ' + Buffer.from(ADMIN_TOKEN).toString('base64')]) {
      const res = await request(h.app).get('/admin/metrics').set('Authorization', bad);
      expect(res.status, `expected 401 for Authorization: ${bad}`).toBe(401);
    }

    const ok = await request(h.app).get('/admin/metrics').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('eventCounts');
    expect(ok.body).toHaveProperty('teachers', 0);
  });

  it('(b) POST /internal/cron/nudges: 401 with no secret, 401 with a wrong one, 200 with the right one', async () => {
    const h = harness();
    const none = await request(h.app).post('/internal/cron/nudges');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: 'unauthorized' });

    for (const bad of ['wrong-secret', `${CRON_SECRET}x`, '']) {
      const res = await request(h.app).post('/internal/cron/nudges').set('x-cron-secret', bad);
      expect(res.status, `expected 401 for x-cron-secret: "${bad}"`).toBe(401);
    }
    // an ADMIN_TOKEN must not open the cron endpoint, and vice versa
    expect((await request(h.app).post('/internal/cron/nudges').set('x-cron-secret', ADMIN_TOKEN)).status).toBe(401);
    expect((await request(h.app).get('/admin/metrics').set('Authorization', `Bearer ${CRON_SECRET}`)).status).toBe(401);

    const ok = await request(h.app).post('/internal/cron/nudges').set('x-cron-secret', CRON_SECRET);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ sent: 0 });
  });

  it('(c) signature validation ON: a bogus X-Twilio-Signature is rejected 403 and never reaches the handler', async () => {
    // twilio.webhook() overwrites options.authToken from process.env.TWILIO_AUTH_TOKEN, so the env
    // var must be stubbed BEFORE createApp for validation to use our token (see docs/qa/phase-4.md).
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    const h = harness({ validateSignature: true });

    const form = { From: FROM, WaId: WA_ID, ProfileName: 'Meera', Body: 'Hi', MessageSid: 'SM-forged' };
    const forged = await request(h.app).post(WEBHOOK_PATH).type('form').set('X-Twilio-Signature', 'bogus-signature').send(form);
    expect(forged.status).toBe(403);
    expect(forged.text).toContain('Twilio Request Validation Failed');

    // a signature that is valid for a DIFFERENT body must not be replayable onto this one
    const otherSig = getExpectedTwilioSignature(AUTH_TOKEN, `${BASE_URL}${WEBHOOK_PATH}`, { ...form, Body: 'different' });
    expect((await request(h.app).post(WEBHOOK_PATH).type('form').set('X-Twilio-Signature', otherSig).send(form)).status).toBe(403);

    // a signature computed with the WRONG auth token is rejected too
    const wrongToken = getExpectedTwilioSignature('not-the-auth-token', `${BASE_URL}${WEBHOOK_PATH}`, form);
    expect((await request(h.app).post(WEBHOOK_PATH).type('form').set('X-Twilio-Signature', wrongToken).send(form)).status).toBe(403);

    // missing header entirely -> 400 (twilio's own "no signature header" branch)
    expect((await request(h.app).post(WEBHOOK_PATH).type('form').send(form)).status).toBe(400);

    // none of the rejected requests created a teacher
    expect(await h.teachers.listAll()).toEqual([]);
    expect(h.events.rows).toEqual([]);
  });

  it('(c2) signature validation ON: a correctly signed request is accepted and processed', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    const h = harness({ validateSignature: true });

    const form = { From: FROM, WaId: WA_ID, ProfileName: 'Meera', Body: 'Hi', MessageSid: 'SM-genuine' };
    const sig = getExpectedTwilioSignature(AUTH_TOKEN, `${BASE_URL}${WEBHOOK_PATH}`, form);
    const res = await request(h.app).post(WEBHOOK_PATH).type('form').set('X-Twilio-Signature', sig).send(form);

    expect(res.status).toBe(200);
    expect(res.text).toContain('<Response/>');
    await vi.waitFor(() => expect(h.events.names()).toContain(EVENT.welcome_sent), { timeout: 5_000, interval: 5 });
    expect((await h.teacher()).state).toBe('AWAITING_GRADE');
  });

  it('(d) the webhook does not leak the framework banner and health needs no auth', async () => {
    const h = harness();
    const res = await request(h.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

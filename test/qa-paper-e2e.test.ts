/**
 * Phase 6 QA gate — the AI Question Paper Generator (independent of the implementers).
 *
 * Case 2 — supertest END-TO-END: the REAL Express app + the REAL inbound handler + the REAL
 *          executor + the REAL state machine + the REAL paper wizard, wired over in-memory fakes
 *          only. Nothing about the conversation logic is mocked; only the I/O edges (Twilio,
 *          Anthropic, Supabase rows, Supabase Storage, Twilio media download) are fakes.
 *          Zero live side effects, zero cost.
 * Case 3 — failure injection at each paper-specific edge: every one must degrade gracefully,
 *          the teacher must never be stranded, and the webhook must still ACK 200 so Twilio
 *          never retries.
 *
 * Helpers are copied (not imported) from test/qa-e2e.test.ts on purpose: a QA suite must not
 * break when another suite's helpers change.
 *
 * NOTE on the async webhook: createApp ACKs 200 immediately and dispatches via setImmediate,
 * which is never awaited. Every POST below therefore goes through `post()`, which waits for the
 * handler to actually settle before the test asserts on any side effect.
 */
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp, WEBHOOK_PATH, type AppDeps } from '../src/http/app.js';
import { createInboundHandler } from '../src/bot/handle.js';
import { createNudgePass } from '../src/jobs/nudges.js';
import type { ExecutorDeps } from '../src/bot/executor.js';
import { webDeps } from './helpers/web-deps.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
  FakeMediaFetcher, FakePaperGenerator, FakeDocBuilder, FakePaperStore, InMemoryPapersRepo,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo, samplePaperJson,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import { MAX_CHUNK } from '../src/bot/machine.js';
import { buildPreviewText, MAX_PAPER_REDOS } from '../src/bot/paper/wizard.js';
import type { PaperJson, PaperTier, PaperTierId, Teacher } from '../src/domain/types.js';

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

const CHAPTER = 'टोपी शुक्ला';
const SCHOOL = 'Zilla Parishad High School, Wardha';
const PHOTO = { url: 'https://api.twilio.com/2010-04-01/Accounts/ACqa/Messages/MMqa/Media/ME1', contentType: 'image/jpeg' };
const PHOTO2 = { url: 'https://api.twilio.com/2010-04-01/Accounts/ACqa/Messages/MMqa/Media/ME2', contentType: 'image/jpeg' };

/**
 * A realistic THREE-tier paper — deliberately large enough that buildPreviewText() exceeds the
 * 1500-char WhatsApp body limit, so the <=1500 assertion below has real teeth (samplePaperJson's
 * single tier does not). Marks per tier sum to totalMarks, matching the real generator's shape check.
 */
const TASK_HEADINGS: Array<[string, string]> = [
  ['कार्य 1 — पठन-बोध एवं शब्दज्ञान', 'Reading Comprehension & Vocabulary'],
  ['कार्य 2 — व्याकरण एवं भाषा-प्रयोग', 'Language in Use'],
  ['कार्य 3 — पाठ-आधारित विश्लेषण', 'Textual Analysis'],
  ['कार्य 4 — सृजनात्मक एवं व्यक्तिगत अभिव्यक्ति', 'Creative / Personal Response'],
];

const LONG_QUESTION =
  'टोपी और इफ़्फ़न की मित्रता किन सामाजिक बाधाओं को पार करती है? पाठ से दो प्रसंग चुनकर अपने उत्तर की पुष्टि कीजिए और बताइए कि लेखक इसके माध्यम से क्या कहना चाहता है।';

function bigTier(tier: PaperTierId, tierLabel: string, timeMinutes: string): PaperTier {
  return {
    tier,
    tierLabel,
    timeMinutes,
    totalMarks: 20,
    tasks: ([1, 2, 3, 4] as const).map((n) => ({
      taskNumber: n,
      heading: TASK_HEADINGS[n - 1][0],
      headingEnglish: TASK_HEADINGS[n - 1][1],
      instructions: 'निर्देश: नीचे दिए गए सभी प्रश्न अनिवार्य हैं। उत्तर स्पष्ट और क्रमबद्ध लिखिए।',
      passage: n === 1 ? 'गद्यांश: टोपी शुक्ला अपने घर के आँगन में बैठा इफ़्फ़न की दादी की बातें याद कर रहा था…' : null,
      questions: [
        {
          number: 1,
          type: n === 1 ? ('MCQ' as const) : ('SA' as const),
          text: `${n}.1 ${LONG_QUESTION}`,
          marks: 3,
          options: n === 1 ? ['क) मित्रता', 'ख) भाषा', 'ग) धर्म', 'घ) परिवार'] : null,
          matchPairs: null,
          answer: 'अपेक्षित उत्तर के मुख्य बिंदु।',
          answerNotes: null,
        },
        {
          number: 2,
          type: 'LA' as const,
          text: `${n}.2 ${LONG_QUESTION}`,
          marks: 2,
          options: null,
          matchPairs: null,
          answer: 'अपेक्षित उत्तर के मुख्य बिंदु।',
          answerNotes: null,
        },
      ],
    })),
  };
}

const BIG_PAPER: PaperJson = samplePaperJson({
  title: 'अभ्यास-पत्र: टोपी शुक्ला (कक्षा 9–12, तीन स्तर)',
  tiers: [
    bigTier('A', 'Foundational', '35–40'),
    bigTier('B', 'Proficient', '40–45'),
    bigTier('C', 'Advanced', '50–60'),
  ],
  sourceNotes: [
    'पृष्ठ 3 का कुछ भाग धुंधला था — उस अंश से कोई प्रश्न नहीं बनाया गया है।',
    'Questions were drawn from the pages you sent; please check them against your prescribed edition.',
  ],
});

/** A worksheet fixture for the core-loop regression (Case 3f) — long enough that chunkText splits it. */
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

interface Ack {
  status: number;
  text: string;
  contentType: string;
}

interface Harness {
  app: ReturnType<typeof createApp>;
  clock: FixedClock;
  teachers: InMemoryTeacherRepo;
  events: InMemoryEventLog;
  messenger: FakeMessenger;
  generator: FakeGenerator;
  mediaFetcher: FakeMediaFetcher;
  paperGenerator: FakePaperGenerator;
  docBuilder: FakeDocBuilder;
  paperStore: FakePaperStore;
  papers: InMemoryPapersRepo;
  /** POST a Twilio-style inbound form (optionally with one media attachment), then wait for the async handler to settle. */
  post(body: string, media?: { url: string; contentType: string }): Promise<Ack>;
  teacher(): Promise<Teacher>;
  paperEvents(): string[];
  documents(): string[];
}

function harness(): Harness {
  const clock = new FixedClock(NOW);
  const teachers = new InMemoryTeacherRepo();
  const events = new InMemoryEventLog();
  const messenger = new FakeMessenger();
  const generator = new FakeGenerator(MODEL_TEXT);
  const mediaFetcher = new FakeMediaFetcher();
  const paperGenerator = new FakePaperGenerator(BIG_PAPER);
  const docBuilder = new FakeDocBuilder();
  const paperStore = new FakePaperStore();
  const papers = new InMemoryPapersRepo();
  const exec: ExecutorDeps = {
    teachers, events, generations: new InMemoryGenerationStore(), messenger, generator,
    pdfBuilder: new FakePdfBuilder(), pdfStore: new FakePdfStore(),
    mediaFetcher, paperGenerator, docBuilder, paperStore, papers,
    clock, joinLink: JOIN, timezone: TZ,
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
    TWILIO_VALIDATE_SIGNATURE: false,
    PUBLIC_BASE_URL: BASE_URL,
    ADMIN_TOKEN,
    CRON_SECRET,
  };
  const app = createApp({ ...webDeps(), config, handleInbound, runNudgePass: createNudgePass(exec), teachers, events, clock });

  let n = 0;
  async function post(body: string, media?: { url: string; contentType: string }): Promise<Ack> {
    const target = ++n;
    clock.advance(STEP_MS); // a human types every 30s
    const form: Record<string, string> = {
      From: FROM, WaId: WA_ID, ProfileName: 'Meera', Body: body, MessageSid: `SM${target}`,
      To: 'whatsapp:+14155238886', NumMedia: media ? '1' : '0',
    };
    if (media) {
      form.MediaUrl0 = media.url;
      form.MediaContentType0 = media.contentType;
    }
    const res = await request(app).post(WEBHOOK_PATH).type('form').send(form);
    await vi.waitFor(() => expect(settled).toBe(target), { timeout: 5_000, interval: 5 });
    return { status: res.status, text: res.text, contentType: String(res.headers['content-type'] ?? '') };
  }

  async function teacher(): Promise<Teacher> {
    const t = await teachers.findByWaFrom(FROM);
    if (!t) throw new Error('teacher not found');
    return t;
  }

  return {
    app, clock, teachers, events, messenger, generator, mediaFetcher, paperGenerator,
    docBuilder, paperStore, papers, post, teacher,
    paperEvents: () => events.names().filter((name) => name.startsWith('paper_')),
    documents: () => messenger.sent.filter((s) => s.kind === 'document').map((s) => s.url ?? ''),
  };
}

/** Hi -> choice 1 (worksheet) -> grade 3 (High) -> subject 5 (Other) -> board 1 (CBSE); lands her AWAITING_TOPIC. */
const ONBOARD = ['Hi', '1', '3', '5', '1'];

/**
 * The REAL wizard order, read off src/bot/paper/wizard.ts (NOT guessed):
 *   paper -> PAPER_SUBJECT(language) -> PAPER_CHAPTER -> PAPER_MEDIA(photo, DONE)
 *   -> PAPER_TYPE -> PAPER_TIERS -> PAPER_KEY -> PAPER_SCHOOL -> PAPER_LOGO -> generation.
 * PAPER_SCHOOL/PAPER_LOGO are asked only while teacher.schoolName is null (one-time setup).
 */
async function toPreview(h: Harness): Promise<void> {
  for (const body of ONBOARD) await h.post(body);
  await h.post('paper');
  await h.post('2'); // language: Hindi
  await h.post(CHAPTER);
  await h.post('', PHOTO); // a lesson-page photo
  await h.post('DONE');
  await h.post('3'); // type: Question paper (test/exam)
  await h.post('1'); // tiers: all three
  await h.post('1'); // answer key: yes
  await h.post(SCHOOL);
  await h.post('SKIP'); // logo
}

// ---------------------------------------------------------------------------
// Case 2 — supertest end-to-end paper flow over the whole stack
// ---------------------------------------------------------------------------
describe('QA Case 2 — end-to-end paper flow over HTTP (app + handler + executor + wizard + adapters)', () => {
  interface Driven {
    h: Harness;
    acks: Ack[];
    teacher: Teacher;
    texts: string[];
  }

  async function drive(): Promise<Driven> {
    const h = harness();
    const acks: Ack[] = [];
    for (const body of ONBOARD) acks.push(await h.post(body));
    acks.push(await h.post('paper'));
    acks.push(await h.post('2'));
    acks.push(await h.post(CHAPTER));
    acks.push(await h.post('', PHOTO));
    acks.push(await h.post('DONE'));
    acks.push(await h.post('3'));
    acks.push(await h.post('1'));
    acks.push(await h.post('1'));
    acks.push(await h.post(SCHOOL));
    acks.push(await h.post('SKIP'));
    acks.push(await h.post('1')); // preview -> get the Word file
    acks.push(await h.post('2')); // impact -> about an hour
    return { h, acks, teacher: await h.teacher(), texts: h.messenger.texts() };
  }

  it('(a) every inbound POST — including the photo — is ACKed 200 with empty TwiML', async () => {
    const { acks } = await drive();
    expect(acks).toHaveLength(17); // 5 onboarding (incl. the make-choice) + 12 paper-wizard turns
    for (const a of acks) {
      expect(a.status).toBe(200);
      expect(a.contentType).toContain('xml');
      expect(a.text).toContain('<Response/>');
    }
  });

  it('(b) emits the paper_* events in exactly the PRD order, with no rejections or errors', async () => {
    const { h } = await drive();
    expect(h.paperEvents()).toEqual([
      EVENT.paper_started,
      EVENT.paper_subject_captured,
      EVENT.paper_chapter_captured,
      EVENT.paper_media_received,
      EVENT.paper_media_done,
      EVENT.paper_type_captured,
      EVENT.paper_tiers_captured,
      EVENT.paper_key_captured,
      EVENT.paper_school_captured,
      EVENT.paper_logo_captured,
      EVENT.paper_generation_started,
      EVENT.paper_generated,
      EVENT.paper_qc_completed,
      EVENT.paper_preview_sent,
      EVENT.paper_exported,
      EVENT.paper_minutes_saved,
    ]);
    expect(h.events.names()).not.toContain(EVENT.error_occurred);
    expect(h.events.names()).not.toContain(EVENT.paper_media_rejected);
    expect(h.events.names()).not.toContain(EVENT.paper_generation_failed);
  });

  it('(b2) the captured event payloads round-trip the teacher\'s real answers, Devanagari included', async () => {
    const { h } = await drive();
    const prop = (name: string) => h.events.rows.find((r) => r.name === name)?.properties ?? {};
    expect(prop(EVENT.paper_subject_captured)).toMatchObject({ value: 'Hindi' });
    expect(prop(EVENT.paper_chapter_captured)).toMatchObject({ value: CHAPTER }); // UTF-8 survived the urlencoded webhook
    expect(prop(EVENT.paper_media_received)).toMatchObject({ count: 1 });
    expect(prop(EVENT.paper_media_done)).toMatchObject({ count: 1 });
    expect(prop(EVENT.paper_type_captured)).toMatchObject({ value: 'question_paper' });
    expect(prop(EVENT.paper_tiers_captured)).toMatchObject({ tiers: ['A', 'B', 'C'] });
    expect(prop(EVENT.paper_key_captured)).toMatchObject({ teacherVersion: true });
    expect(prop(EVENT.paper_school_captured)).toMatchObject({ skipped: false });
    expect(prop(EVENT.paper_logo_captured)).toMatchObject({ stored: false });
    expect(prop(EVENT.paper_generation_started)).toMatchObject({ chapter: CHAPTER, mediaCount: 1 });
    expect(prop(EVENT.paper_generated)).toMatchObject({ tiers: 3, totalMarks: 60 });
    expect(prop(EVENT.paper_qc_completed)).toMatchObject({ pass: true, repaired: false });
    expect(prop(EVENT.paper_preview_sent)).toMatchObject({ tiers: 3, qcPass: true });
    expect(prop(EVENT.paper_minutes_saved)).toMatchObject({ minutes: 60 });
  });

  it('(c) the paper-name TEXT is delivered immediately BEFORE the document (WhatsApp docs carry no caption)', async () => {
    const { h } = await drive();
    const sent = h.messenger.sent;
    const docIdx = sent.findIndex((s) => s.kind === 'document');

    expect(sent.filter((s) => s.kind === 'document')).toHaveLength(1);
    expect(docIdx).toBeGreaterThan(0);
    expect(sent[docIdx].url).toMatch(/\.docx$/);

    // load-bearing ordering: name -> file -> impact question
    const before = sent[docIdx - 1];
    expect(before.kind).toBe('text');
    expect(before.body).toContain('Here comes your paper');
    expect(before.body).toContain(BIG_PAPER.title);
    expect(before.body).toContain('AI can make mistakes');

    const after = sent[docIdx + 1];
    expect(after.kind).toBe('text');
    expect(after.body).toContain('how long would making this paper have taken you by hand');
  });

  it('(d) a papers row is saved, matching the delivered docx', async () => {
    const { h } = await drive();
    expect(h.papers.saved).toHaveLength(1);
    const row = h.papers.saved[0];
    expect(row.docxUrl).toBe(h.documents()[0]);
    expect(row.teacherId).toBe((await h.teacher()).id);
    expect(row.totalMarks).toBe(60); // 3 tiers x 20
    expect(row.redoCount).toBe(0);
    expect(row.pageCount).toBe(1); // one lesson photo
    expect(row.request).toMatchObject({
      subject: 'Hindi', language: 'Hindi', chapter: CHAPTER,
      assessmentType: 'question_paper', tiers: ['A', 'B', 'C'], teacherVersion: true, adjustment: null,
    });
    expect(row.at).toBeInstanceOf(Date);
  });

  it('(e) every outbound text is within the 1500-char WhatsApp limit — and the preview really was split', async () => {
    const { texts } = await drive();
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((t) => t.length > MAX_CHUNK)).toEqual([]);
    expect(MAX_CHUNK).toBe(1500);
    // the fixture is genuinely over the limit, so chunkText was actually exercised on this path
    expect(buildPreviewText(BIG_PAPER, []).length).toBeGreaterThan(MAX_CHUNK);
    expect(texts.filter((t) => t.includes('TIER A') || t.includes('TIER C')).length).toBeGreaterThanOrEqual(2);
  });

  it('(f) the media, generator, docx builder and store all received the real request', async () => {
    const { h } = await drive();
    expect(h.mediaFetcher.fetched.map((m) => m.url)).toEqual([PHOTO.url]);

    expect(h.paperGenerator.calls).toHaveLength(1);
    expect(h.paperGenerator.calls[0].media).toHaveLength(1);
    expect(h.paperGenerator.calls[0].profile).toEqual({ grade: 'High (Classes 9-12)', subject: 'Other', board: 'CBSE' });
    expect(h.paperGenerator.qcCalls).toBe(1);

    expect(h.docBuilder.builds).toHaveLength(1);
    expect(h.docBuilder.builds[0].teacherVersion).toBe(true);
    expect(h.docBuilder.builds[0].branding).toEqual({ schoolName: SCHOOL, logo: null });
    expect(h.docBuilder.builds[0].paper.tiers).toHaveLength(3);

    expect(h.paperStore.storedDocs).toHaveLength(1);
    expect(h.paperStore.storedDocs[0].bytes).toBeGreaterThan(0);
    expect(h.paperStore.storedLogos).toEqual([]); // she skipped the logo
  });

  it('(g) lands the teacher IDLE with the school remembered and no core skill falsely completed', async () => {
    const { teacher, texts } = await drive();
    expect(teacher.state).toBe('IDLE');
    expect(teacher.schoolName).toBe(SCHOOL);
    expect(teacher.schoolLogoUrl).toBeNull();
    expect(teacher.paperRedoCount).toBe(0);
    // M1 (whole-branch review): paperJson/paperRequest are read on EVERY inbound message and are
    // dead weight once the wizard has truly finished -- the terminal PAPER_IMPACT->IDLE transition
    // now clears both. The delivered docx (already asserted in test (d)/(f)) is unaffected.
    expect(teacher.paperJson).toBeNull();
    expect(teacher.paperRequest).toBeNull();
    expect(teacher.retries).toBe(0);
    expect(teacher.skillsCompleted).toEqual([]); // the paper flow is not a core skill
    expect(texts.at(-1)).toContain(JOIN);
    expect(texts.at(-1)).toContain('Type *PAPER* for another paper');
  });

  it('(h) a SECOND paper skips the one-time school/logo setup entirely', async () => {
    const { h } = await drive();
    const before = h.paperEvents().length;

    await h.post('paper');
    await h.post('1'); // language: English
    await h.post('The Fun They Had');
    await h.post('SKIP'); // no photos — chapter-knowledge mode
    await h.post('1'); // type: Worksheet
    await h.post('2'); // tiers: only Tier A
    await h.post('2'); // answer key: no

    const second = h.paperEvents().slice(before);
    expect(second).toEqual([
      EVENT.paper_started,
      EVENT.paper_subject_captured,
      EVENT.paper_chapter_captured,
      EVENT.paper_media_done,
      EVENT.paper_type_captured,
      EVENT.paper_tiers_captured,
      EVENT.paper_key_captured,
      EVENT.paper_generation_started, // <- straight to generation, no school/logo prompts
      EVENT.paper_generated,
      EVENT.paper_qc_completed,
      EVENT.paper_preview_sent,
    ]);
    expect((await h.teacher()).state).toBe('PAPER_PREVIEW');
    expect(h.paperGenerator.calls[1].request).toMatchObject({ tiers: ['A'], teacherVersion: false, media: [] });
    expect(h.messenger.texts().filter((t) => t.length > MAX_CHUNK)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — failure injection on the paper path
// ---------------------------------------------------------------------------
describe('QA Case 3 — failure injection: every paper edge degrades gracefully', () => {
  it('(a) media download fails: she is returned to PAPER_MEDIA with a clear retry ask, not stranded', async () => {
    const h = harness();
    h.mediaFetcher.failWith = new Error('twilio media 404');
    await toPreview(h);

    const t = await h.teacher();
    expect(t.state).toBe('PAPER_MEDIA'); // not stuck in PAPER_GENERATING
    expect(t.paperRequest?.media).toEqual([]); // the unreadable pages were dropped
    expect(t.retries).toBe(0);

    const names = h.events.names();
    expect(names).toContain(EVENT.paper_media_rejected);
    expect(h.events.rows.find((r) => r.name === EVENT.paper_media_rejected)?.properties)
      .toMatchObject({ reason: 'fetch_failed', url: PHOTO.url });
    expect(h.events.rows.find((r) => r.name === EVENT.paper_generation_failed)?.properties)
      .toMatchObject({ reason: 'no_readable_media' });
    expect(h.paperGenerator.calls).toEqual([]); // no model call was billed for unreadable pages

    expect(h.messenger.texts().at(-1)).toContain("I couldn't read those pages");
    expect(h.messenger.sent.some((s) => s.kind === 'document')).toBe(false);

    // ...and she recovers by sending a clearer photo — the school/logo setup is not re-asked
    h.mediaFetcher.failWith = null;
    expect((await h.post('', PHOTO2)).status).toBe(200);
    await h.post('DONE');
    await h.post('3');
    await h.post('1');
    await h.post('1');

    expect((await h.teacher()).state).toBe('PAPER_PREVIEW');
    expect(h.paperGenerator.calls).toHaveLength(1);
    expect(h.events.names()).toContain(EVENT.paper_preview_sent);
  });

  it('(b) paper generation throws: apology + IDLE, paper_generation_failed and error_occurred logged', async () => {
    const h = harness();
    h.paperGenerator.failWith = new Error('anthropic 529 overloaded');
    await toPreview(h);

    const t = await h.teacher();
    expect(t.state).toBe('IDLE'); // a sane terminal state, not a dead-end PAPER_GENERATING
    expect(t.retries).toBe(0);

    const names = h.events.names();
    expect(names).toContain(EVENT.paper_generation_started);
    expect(names).toContain(EVENT.paper_generation_failed);
    expect(names).not.toContain(EVENT.paper_generated);
    expect(names).not.toContain(EVENT.paper_preview_sent);
    expect(h.events.rows.find((r) => r.name === EVENT.paper_generation_failed)?.properties).toMatchObject({ reason: 'error' });
    expect(h.events.rows.find((r) => r.name === EVENT.error_occurred)?.properties)
      .toMatchObject({ where: 'generate_paper', message: 'anthropic 529 overloaded' });

    expect(h.messenger.texts().at(-1)).toContain("that paper didn't come together");
    expect(h.messenger.sent.some((s) => s.kind === 'document')).toBe(false);
    expect(h.papers.saved).toEqual([]);

    // she can start over immediately — and the recovered run succeeds
    h.paperGenerator.failWith = null;
    expect((await h.post('paper')).status).toBe(200);
    expect((await h.teacher()).state).toBe('PAPER_SUBJECT');
  });

  it('(c) docx upload fails: no crash, error_occurred logged, and she keeps her paper to retry — not left empty-handed', async () => {
    const h = harness();
    await toPreview(h);
    expect((await h.teacher()).state).toBe('PAPER_PREVIEW');

    h.paperStore.failWith = new Error('supabase storage 503');
    const res = await h.post('1'); // ask for the Word file

    expect(res.status).toBe(200); // the webhook still ACKs — Twilio must never retry
    expect(h.events.rows.find((r) => r.name === EVENT.error_occurred)?.properties)
      .toMatchObject({ where: 'render_paper', message: 'supabase storage 503' });
    expect(h.events.names()).not.toContain(EVENT.paper_exported);

    expect(h.documents()).toEqual([]);
    expect(h.papers.saved).toEqual([]); // the row is only written after a successful upload
    expect(h.docBuilder.builds).toHaveLength(1); // the docx was built; only the upload failed
    const texts = h.messenger.texts();
    expect(texts.at(-2)).toContain('Something went wrong'); // acknowledges the failure honestly...
    expect(texts.at(-1)).toContain('Get the Word file'); // ...then immediately re-offers the retry, not a dead-end apology
    expect(texts.some((t) => t.includes('TIER A'))).toBe(true); // and still holds the preview she was sent
    expect(texts.filter((t) => t.length > MAX_CHUNK)).toEqual([]);

    // she is NOT stranded (QA-6 F1): still at PAPER_PREVIEW with her already-generated paper
    // intact, so "1) Get the Word file" is retryable once Storage recovers — a transient upload
    // failure must never cost her the 2-3 minutes (and the paid generation) she already spent.
    const stranded = await h.teacher();
    expect(stranded.state).toBe('PAPER_PREVIEW');
    expect(stranded.paperJson).not.toBeNull();
    expect(stranded.paperRedoCount).toBe(0); // the retry did not consume redo budget

    h.paperStore.failWith = null;
    const retry = await h.post('1'); // the SAME "get the file" request, now that Storage is back
    expect(retry.status).toBe(200);
    expect((await h.teacher()).state).toBe('PAPER_IMPACT');
    expect(h.documents()).toHaveLength(1);
    expect(h.papers.saved).toHaveLength(1);
  });

  it('(d) the redo cap is enforced — she cannot loop forever', async () => {
    const h = harness();
    await toPreview(h);
    expect(MAX_PAPER_REDOS).toBe(3);

    for (let i = 1; i <= MAX_PAPER_REDOS; i++) {
      const res = await h.post('2'); // 2) Try a fresh version
      expect(res.status).toBe(200);
      expect((await h.teacher()).paperRedoCount).toBe(i);
      expect(h.paperGenerator.calls).toHaveLength(i + 1); // 1 original + i redos
    }
    expect(h.messenger.texts().at(-1)).toContain("used all the redos");

    // the 4th request is refused: no further model call, no state change, still at the preview
    const res = await h.post('3'); // 3) Make it harder
    expect(res.status).toBe(200);
    expect(h.paperGenerator.calls).toHaveLength(MAX_PAPER_REDOS + 1); // <- capped
    const t = await h.teacher();
    expect(t.paperRedoCount).toBe(MAX_PAPER_REDOS);
    expect(t.state).toBe('PAPER_PREVIEW');
    expect(h.events.names().filter((n) => n === EVENT.paper_redo_requested)).toHaveLength(MAX_PAPER_REDOS);
    expect(h.messenger.texts().at(-1)).toContain("used all the redos");

    // and she can still take the file, which records the redo count
    await h.post('1');
    expect((await h.teacher()).state).toBe('PAPER_IMPACT');
    expect(h.papers.saved[0].redoCount).toBe(MAX_PAPER_REDOS);
    expect(h.documents()).toHaveLength(1);
  });

  it('(e) RESTART mid-wizard wipes every scrap of paper state', async () => {
    const h = harness();
    await toPreview(h);
    const atPreview = await h.teacher();
    expect(atPreview.state).toBe('PAPER_PREVIEW');
    expect(atPreview.paperRequest).not.toBeNull();
    expect(atPreview.paperJson).not.toBeNull();

    const res = await h.post('restart');
    expect(res.status).toBe(200);

    const t = await h.teacher();
    expect(t.state).toBe('AWAITING_CHOICE');
    expect(t.paperRequest).toBeNull();
    expect(t.paperJson).toBeNull();
    expect(t.paperRedoCount).toBe(0);
    expect(t.grade).toBeNull();
    expect(t.subject).toBeNull();
    expect(t.board).toBeNull();
    expect(h.events.names()).toContain(EVENT.restarted);
    // the one-time branding survives a restart on purpose — it is profile data, not wizard state
    expect(t.schoolName).toBe(SCHOOL);
  });

  it('(f) the CORE worksheet flow still completes normally after an abandoned paper wizard', async () => {
    const h = harness();
    for (const body of ONBOARD) await h.post(body);
    // start a paper, then walk away from it mid-wizard
    await h.post('paper');
    await h.post('2');
    await h.post(CHAPTER);
    expect((await h.teacher()).state).toBe('PAPER_MEDIA');

    // "NEW" pulls her back to the choice menu; picking worksheet re-enters the core loop
    await h.post('new');
    expect((await h.teacher()).state).toBe('AWAITING_CHOICE');
    await h.post('1'); // pick worksheet
    expect((await h.teacher()).state).toBe('AWAITING_TOPIC');

    await h.post('Comparing fractions with unlike denominators');
    await h.post('2'); // impact
    await h.post('1'); // referral

    const t = await h.teacher();
    expect(t.state).toBe('IDLE');
    expect(t.skillsCompleted).toEqual(['worksheet']);
    expect(t.currentSkillId).toBeNull();
    expect(t.pendingTopic).toBeNull();

    const names = h.events.names();
    expect(names).toContain(EVENT.generation_succeeded);
    expect(names).toContain(EVENT.worksheet_delivered);
    expect(names).toContain(EVENT.pdf_delivered);
    expect(names).toContain(EVENT.skill_completed);
    expect(names).not.toContain(EVENT.error_occurred);
    expect(names).not.toContain(EVENT.generation_failed);

    const texts = h.messenger.texts();
    expect(texts.some((t2) => t2.includes('LEVEL 1 - SUPPORT'))).toBe(true);
    expect(texts.some((t2) => t2.includes('ANSWER KEY'))).toBe(true);
    expect(texts.filter((t2) => t2.length > MAX_CHUNK)).toEqual([]);
    expect(MODEL_TEXT.length).toBeGreaterThan(MAX_CHUNK); // the worksheet really was chunked
    expect(h.documents()).toHaveLength(1);
    expect(h.documents()[0]).toMatch(/\.pdf$/);

    // no paper artifact was produced by the abandoned wizard
    expect(h.paperGenerator.calls).toEqual([]);
    expect(h.papers.saved).toEqual([]);
  });
});

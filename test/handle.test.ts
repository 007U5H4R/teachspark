import { describe, it, expect } from 'vitest';
import { createInboundHandler } from '../src/bot/handle.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
  FakeMediaFetcher, FakePaperGenerator, FakeDocBuilder, FakePaperStore, InMemoryPapersRepo,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import type { ExecutorDeps } from '../src/bot/executor.js';
import type { InboundMessage } from '../src/domain/types.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');
const MODEL_TEXT = 'TITLE: T\nLEVEL 1 - SUPPORT\n1. q\nLEVEL 2 - ON LEVEL\n1. q\nLEVEL 3 - CHALLENGE\n1. q\nANSWER KEY\n1) a';

function makeDeps(): ExecutorDeps {
  return {
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(), generations: new InMemoryGenerationStore(),
    messenger: new FakeMessenger(), generator: new FakeGenerator(MODEL_TEXT), pdfBuilder: new FakePdfBuilder(),
    pdfStore: new FakePdfStore(),
    mediaFetcher: new FakeMediaFetcher(), paperGenerator: new FakePaperGenerator(), docBuilder: new FakeDocBuilder(),
    paperStore: new FakePaperStore(), papers: new InMemoryPapersRepo(),
    clock: new FixedClock(NOW),
    joinLink: 'https://wa.me/1?text=join%20x', timezone: 'Asia/Kolkata',
  };
}
const msg = (body: string, from = 'whatsapp:+911'): InboundMessage =>
  ({ from, waId: '911', profileName: 'Meera', body, messageSid: `SM${Math.random()}`, buttonPayload: null, media: [] });

describe('createInboundHandler', () => {
  it('creates the teacher on first contact and logs session_started', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    expect(t).not.toBeNull();
    expect(t?.state).toBe('AWAITING_CHOICE');
    expect((deps.events as InMemoryEventLog).names()).toEqual(
      expect.arrayContaining([EVENT.session_started, EVENT.message_received, EVENT.welcome_sent]),
    );
    expect((deps.messenger as FakeMessenger).texts()[0]).toContain('Worksheet');
  });

  it('drives the whole funnel end-to-end with fakes', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    for (const body of ['hi', '1', '2', '1', '1', 'Comparing fractions', '2', '1']) await handle(msg(body));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    expect(t?.state).toBe('IDLE');
    expect(t?.skillsCompleted).toEqual(['worksheet']);
    expect(t?.activatedAt).toEqual(NOW);
    expect(t?.nudgeDueAt).not.toBeNull();
    const names = (deps.events as InMemoryEventLog).names();
    for (const expected of [
      EVENT.session_started, EVENT.welcome_sent, EVENT.grade_captured, EVENT.subject_captured, EVENT.board_captured,
      EVENT.onboarding_completed, EVENT.microlesson_sent, EVENT.topic_provided, EVENT.generation_started,
      EVENT.generation_succeeded, EVENT.worksheet_delivered, EVENT.pdf_delivered, EVENT.reusable_prompt_sent,
      EVENT.impact_prompt_sent, EVENT.activated, EVENT.impact_reported, EVENT.referral_reported,
      EVENT.skill_completed, EVENT.share_cta_sent, EVENT.nudge_scheduled,
    ]) expect(names).toContain(expected);
    // every outbound body within the sandbox limit
    expect((deps.messenger as FakeMessenger).texts().every((b) => b.length <= 1500)).toBe(true);
  });

  it('serializes concurrent messages from the same teacher (in-flight guard)', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    await handle(msg('1')); // pick worksheet -> AWAITING_GRADE
    await Promise.all([handle(msg('2')), handle(msg('2'))]);
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    // exactly one grade capture; the second concurrent message got still-working
    const names = (deps.events as InMemoryEventLog).names();
    expect(names.filter((n) => n === EVENT.grade_captured)).toHaveLength(1);
    expect(t?.state).toBe('AWAITING_SUBJECT');
  });

  it('never throws: repo errors are swallowed and an apology is attempted', async () => {
    const deps = makeDeps();
    deps.teachers.findByWaFrom = async () => { throw new Error('db down'); };
    const handle = createInboundHandler(deps);
    await expect(handle(msg('hi'))).resolves.toBeUndefined();
    expect((deps.messenger as FakeMessenger).texts().at(-1)).toContain('Something went wrong');
  });

  it('in-flight guard uses the paper still-working copy during a paper flow', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    await deps.teachers.update(t!.id, { state: 'PAPER_GENERATING' });
    const before = (deps.messenger as FakeMessenger).texts().length; // 1 (the welcome from "hi")
    await Promise.all([handle(msg('x')), handle(msg('y'))]);

    // M4: the WINNER of the race is processed for real, and paperTransition's own PAPER_GENERATING
    // case ALSO sends copy.paperStillWorking() regardless of the in-flight guard -- so "a text
    // containing 'paper' exists somewhere" passes even if the guard's copy branch were reverted to
    // the core 20-second copy. Assert the guard was actually exercised (exactly one bounce logged)
    // and that BOTH new texts are the paper-specific copy, never the core one.
    const inFlightLogs = (deps.events as InMemoryEventLog).rows.filter(
      (r) => r.name === EVENT.still_working_sent && r.properties.reason === 'in_flight',
    );
    expect(inFlightLogs).toHaveLength(1);
    const texts = (deps.messenger as FakeMessenger).texts().slice(before);
    expect(texts).toHaveLength(2);
    expect(texts.filter((b) => b.includes('Still working on your paper'))).toHaveLength(2);
    expect(texts.some((b) => b.includes('20 more seconds'))).toBe(false); // never the core copy
  });

  it('I2(a): the in-flight guard during PAPER_MEDIA does not falsely claim a paper is being generated', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    await deps.teachers.update(t!.id, {
      state: 'PAPER_MEDIA',
      paperRequest: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'x', assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true, media: [], adjustment: null },
    });
    // two TEXT-only messages (no media) -- neither carries media, so the loser is still bounced
    // immediately (not queued), but the bounce copy must not lie about a paper being generated.
    await Promise.all([handle(msg('DONE')), handle(msg('DONE'))]);
    const texts = (deps.messenger as FakeMessenger).texts();
    expect(texts.some((b) => b.includes('Still working on your paper'))).toBe(false);
    expect(texts.some((b) => /one at a time/i.test(b))).toBe(true);
  });

  it('I2(b): a photo burst during an in-flight PAPER_MEDIA turn is serialized, not dropped', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    await deps.teachers.update(t!.id, {
      state: 'PAPER_MEDIA',
      paperRequest: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'x', assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true, media: [], adjustment: null },
    });
    const photo1: InboundMessage = { ...msg(''), media: [{ url: 'https://api.twilio.com/m/P1', contentType: 'image/jpeg' }] };
    const photo2: InboundMessage = { ...msg(''), media: [{ url: 'https://api.twilio.com/m/P2', contentType: 'image/jpeg' }] };
    await Promise.all([handle(photo1), handle(photo2)]);

    const after = await deps.teachers.findByWaFrom('whatsapp:+911');
    const urls = (after?.paperRequest?.media ?? []).map((m) => m.url).sort();
    expect(urls).toEqual(['https://api.twilio.com/m/P1', 'https://api.twilio.com/m/P2']); // BOTH recorded, neither dropped
    expect((deps.messenger as FakeMessenger).texts().some((b) => /one at a time/i.test(b))).toBe(false); // neither was bounced
  });

  it('I2 constraint: a text-only double-text during a CORE worksheet generation is still bounced immediately, never queued', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    await deps.teachers.update(t!.id, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', lastInboundAt: NOW });
    const before = (deps.messenger as FakeMessenger).texts().length; // 1 (the welcome from "hi")
    await Promise.all([handle(msg('are you there?')), handle(msg('are you there?'))]);

    // exactly one call hit the in-flight guard; the other was processed for real by the core
    // machine's own GENERATING case (which also just sends stillWorking()) -- neither was queued,
    // and the teacher never advances past GENERATING from either path.
    const inFlightLogs = (deps.events as InMemoryEventLog).rows.filter(
      (r) => r.name === EVENT.still_working_sent && r.properties.reason === 'in_flight',
    );
    expect(inFlightLogs).toHaveLength(1);
    const texts = (deps.messenger as FakeMessenger).texts().slice(before);
    expect(texts).toHaveLength(2);
    expect(texts.every((b) => b.includes('20 more seconds'))).toBe(true);
    expect((await deps.teachers.findByWaFrom('whatsapp:+911'))?.state).toBe('GENERATING');
  });

  it('I2 constraint (regression): a MEDIA message during a CORE worksheet generation is still bounced immediately, never queued', async () => {
    // Coordinator's post-review finding: a teacher who never types PAPER and happens to send a
    // photo while her worksheet is generating must NOT take the queue path -- queueing is scoped
    // to paper states only. Without that scoping, the media message above gets queued instead of
    // bounced: no immediate stillWorking() reply, and once the winner's generation lands (moving
    // her to AWAITING_IMPACT) the queued message is processed there instead, producing a spurious
    // unrecognized_input + a bumped retries count -- burning one of her two free menu retries on a
    // photo she may not have even meant to send during this window.
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    await deps.teachers.update(t!.id, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', lastInboundAt: NOW });
    const before = (deps.messenger as FakeMessenger).texts().length; // 1 (the welcome from "hi")
    const withMedia: InboundMessage = { ...msg(''), media: [{ url: 'https://api.twilio.com/m/PX', contentType: 'image/jpeg' }] };
    await Promise.all([handle(msg('are you there?')), handle(withMedia)]);

    // exactly one call hit the in-flight guard (the media-carrying one, if it lost the race, must
    // be bounced too -- not queued); the other was processed for real by GENERATING's own case.
    const inFlightLogs = (deps.events as InMemoryEventLog).rows.filter(
      (r) => r.name === EVENT.still_working_sent && r.properties.reason === 'in_flight',
    );
    expect(inFlightLogs).toHaveLength(1);
    const texts = (deps.messenger as FakeMessenger).texts().slice(before);
    expect(texts).toHaveLength(2);
    expect(texts.every((b) => b.includes('20 more seconds'))).toBe(true);
    expect((deps.events as InMemoryEventLog).names()).not.toContain(EVENT.unrecognized_input);
    const after = await deps.teachers.findByWaFrom('whatsapp:+911');
    expect(after?.state).toBe('GENERATING'); // never advanced via a queued-then-misrouted message
    expect(after?.retries).toBe(0); // no free retry burned
  });
});

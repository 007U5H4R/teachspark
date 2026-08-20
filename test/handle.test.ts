import { describe, it, expect } from 'vitest';
import { createInboundHandler } from '../src/bot/handle.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
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
    pdfStore: new FakePdfStore(), clock: new FixedClock(NOW),
    joinLink: 'https://wa.me/1?text=join%20x', timezone: 'Asia/Kolkata',
  };
}
const msg = (body: string, from = 'whatsapp:+911'): InboundMessage =>
  ({ from, waId: '911', profileName: 'Meera', body, messageSid: `SM${Math.random()}`, buttonPayload: null });

describe('createInboundHandler', () => {
  it('creates the teacher on first contact and logs session_started', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    await handle(msg('hi'));
    const t = await deps.teachers.findByWaFrom('whatsapp:+911');
    expect(t).not.toBeNull();
    expect(t?.state).toBe('AWAITING_GRADE');
    expect((deps.events as InMemoryEventLog).names()).toEqual(
      expect.arrayContaining([EVENT.session_started, EVENT.message_received, EVENT.welcome_sent]),
    );
    expect((deps.messenger as FakeMessenger).texts()[0]).toContain('which grade');
  });

  it('drives the whole funnel end-to-end with fakes', async () => {
    const deps = makeDeps();
    const handle = createInboundHandler(deps);
    for (const body of ['hi', '2', '1', '1', 'Comparing fractions', '2', '1']) await handle(msg(body));
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
});

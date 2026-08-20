import { describe, it, expect } from 'vitest';
import { createNudgePass } from '../src/jobs/nudges.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import type { ExecutorDeps } from '../src/bot/executor.js';

const NOW = new Date('2026-08-24T05:00:00Z');
const PAST = new Date('2026-08-24T04:00:00Z');

function makeDeps(): ExecutorDeps {
  return {
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(), generations: new InMemoryGenerationStore(),
    messenger: new FakeMessenger(), generator: new FakeGenerator('x'), pdfBuilder: new FakePdfBuilder(),
    pdfStore: new FakePdfStore(), clock: new FixedClock(NOW), joinLink: 'https://wa.me/1?text=join%20x', timezone: 'Asia/Kolkata',
  };
}

describe('createNudgePass', () => {
  it('sends the nudge to due IDLE teachers with a next skill and marks it sent', async () => {
    const deps = makeDeps();
    const t = await deps.teachers.create({ waFrom: 'whatsapp:+911', waId: null, profileName: null, now: PAST });
    await deps.teachers.update(t.id, { state: 'IDLE', grade: 'g', subject: 's', board: 'b', skillsCompleted: ['worksheet'], nudgeDueAt: PAST, nudgeSentAt: null });
    const sent = await createNudgePass(deps)();
    expect(sent).toBe(1);
    const after = await deps.teachers.findByWaFrom('whatsapp:+911');
    expect(after?.nudgeSentAt).toEqual(NOW);
    expect(after?.state).toBe('AWAITING_TOPIC');
    expect(after?.currentSkillId).toBe('quiz');
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.nudge_sent);
    expect((deps.messenger as FakeMessenger).texts()[0]).toContain('exit ticket');
  });
  it('skips teachers who are mid-conversation (clears the due nudge)', async () => {
    const deps = makeDeps();
    const t = await deps.teachers.create({ waFrom: 'whatsapp:+912', waId: null, profileName: null, now: PAST });
    await deps.teachers.update(t.id, { state: 'AWAITING_TOPIC', grade: 'g', subject: 's', board: 'b', skillsCompleted: ['worksheet'], nudgeDueAt: PAST, nudgeSentAt: null });
    expect(await createNudgePass(deps)()).toBe(0);
    const after = await deps.teachers.findByWaFrom('whatsapp:+912');
    expect(after?.nudgeDueAt).toBeNull();
    expect((deps.messenger as FakeMessenger).sent).toHaveLength(0);
  });
  it('skips teachers with no remaining skill', async () => {
    const deps = makeDeps();
    const t = await deps.teachers.create({ waFrom: 'whatsapp:+913', waId: null, profileName: null, now: PAST });
    await deps.teachers.update(t.id, { state: 'IDLE', skillsCompleted: ['worksheet', 'quiz'], nudgeDueAt: PAST, nudgeSentAt: null });
    expect(await createNudgePass(deps)()).toBe(0);
  });
  it('one failing teacher does not block the sweep', async () => {
    const deps = makeDeps();
    const a = await deps.teachers.create({ waFrom: 'whatsapp:+914', waId: null, profileName: null, now: PAST });
    const b = await deps.teachers.create({ waFrom: 'whatsapp:+915', waId: null, profileName: null, now: PAST });
    for (const t of [a, b]) await deps.teachers.update(t.id, { state: 'IDLE', grade: 'g', subject: 's', board: 'b', skillsCompleted: ['worksheet'], nudgeDueAt: PAST, nudgeSentAt: null });
    const realUpdate = deps.teachers.update.bind(deps.teachers);
    let first = true;
    deps.teachers.update = async (id, u) => {
      if (id === a.id && first && u.nudgeSentAt) { first = false; throw new Error('db hiccup'); }
      return realUpdate(id, u);
    };
    const sent = await createNudgePass(deps)();
    expect(sent).toBe(1); // b still went out
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.nudge_failed);
  });
});

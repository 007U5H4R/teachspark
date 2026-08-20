import { describe, it, expect } from 'vitest';
import { Executor, type ExecutorDeps } from '../src/bot/executor.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import { GenerationRefusedError } from '../src/domain/types.js';
import type { Step, Teacher } from '../src/domain/types.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');
const MODEL_TEXT = 'TITLE: Fractions\nLEVEL 1 - SUPPORT\n1. q1\nLEVEL 2 - ON LEVEL\n1. q2\nLEVEL 3 - CHALLENGE\n1. q3\nANSWER KEY\nLevel 1: 1) a';

function makeDeps() {
  const deps: ExecutorDeps = {
    teachers: new InMemoryTeacherRepo(),
    events: new InMemoryEventLog(),
    generations: new InMemoryGenerationStore(),
    messenger: new FakeMessenger(),
    generator: new FakeGenerator(MODEL_TEXT),
    pdfBuilder: new FakePdfBuilder(),
    pdfStore: new FakePdfStore(),
    clock: new FixedClock(NOW),
    joinLink: 'https://wa.me/1?text=join%20x',
    timezone: 'Asia/Kolkata',
  };
  return deps;
}
async function makeTeacher(deps: ExecutorDeps, over: Partial<Teacher> = {}): Promise<Teacher> {
  const t = await deps.teachers.create({ waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera', now: NOW });
  return deps.teachers.update(t.id, { grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE', ...over });
}

describe('Executor.runStep', () => {
  it('applies updates, logs events, sends texts in order', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps);
    const step: Step = {
      updates: { state: 'AWAITING_SUBJECT' },
      events: [{ name: EVENT.grade_captured, properties: { value: 'x' } }],
      actions: [{ type: 'send_text', body: 'one' }, { type: 'send_text', body: 'two' }],
    };
    const updated = await new Executor(deps).runStep(t, step);
    expect(updated.state).toBe('AWAITING_SUBJECT');
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.grade_captured);
    expect((deps.messenger as FakeMessenger).texts()).toEqual(['one', 'two']);
  });

  it('runs the full generation pipeline: model -> pdf -> save -> delivery messages', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'Comparing fractions' });
    const step: Step = { updates: {}, events: [], actions: [{ type: 'generate', skillId: 'worksheet', topic: 'Comparing fractions' }] };
    const updated = await new Executor(deps).runStep(t, step);
    const names = (deps.events as InMemoryEventLog).names();
    expect(names).toEqual(expect.arrayContaining([
      EVENT.generation_started, EVENT.generation_succeeded, EVENT.worksheet_delivered,
      EVENT.pdf_delivered, EVENT.reusable_prompt_sent, EVENT.impact_prompt_sent, EVENT.activated,
    ]));
    expect((deps.generations as InMemoryGenerationStore).saved).toHaveLength(1);
    expect((deps.generations as InMemoryGenerationStore).saved[0].pdfUrl).toMatch(/\.pdf$/);
    const sent = (deps.messenger as FakeMessenger).sent;
    expect(sent.some((s) => s.kind === 'document')).toBe(true);
    expect(sent.at(-1)?.body).toContain('1) About 15 minutes');
    expect(updated.state).toBe('AWAITING_IMPACT');
    expect(updated.activatedAt).toEqual(NOW);
    // pdf built from parsed sections, not raw text
    expect((deps.pdfBuilder as FakePdfBuilder).builds[0].sections.map((s) => s.heading)).toEqual([
      'LEVEL 1 - SUPPORT', 'LEVEL 2 - ON LEVEL', 'LEVEL 3 - CHALLENGE', 'ANSWER KEY',
    ]);
  });

  it('pdf failure is non-fatal: text still delivered, pdf_failed logged', async () => {
    const deps = makeDeps();
    (deps.pdfStore as FakePdfStore).failWith = new Error('bucket down');
    const t = await makeTeacher(deps, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x' });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'generate', skillId: 'worksheet', topic: 'x' }] });
    const names = (deps.events as InMemoryEventLog).names();
    expect(names).toContain(EVENT.pdf_failed);
    expect(names).toContain(EVENT.worksheet_delivered);
    expect(updated.state).toBe('AWAITING_IMPACT');
    expect((deps.generations as InMemoryGenerationStore).saved[0].pdfUrl).toBeNull();
  });

  it('generator failure -> apology, generation_failed, back to AWAITING_TOPIC', async () => {
    const deps = makeDeps();
    (deps.generator as FakeGenerator).failWith = new Error('api down');
    const t = await makeTeacher(deps, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x' });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'generate', skillId: 'worksheet', topic: 'x' }] });
    expect(updated.state).toBe('AWAITING_TOPIC');
    const names = (deps.events as InMemoryEventLog).names();
    expect(names).toContain(EVENT.generation_failed);
    expect(names).toContain(EVENT.error_occurred);
    expect((deps.messenger as FakeMessenger).texts().at(-1)).toContain('try again');
  });

  it('failed sends log error_occurred and do not throw, and later actions still run', async () => {
    const deps = makeDeps();
    (deps.messenger as FakeMessenger).failWith = 63016;
    const t = await makeTeacher(deps);
    await new Executor(deps).runStep(t, {
      updates: {},
      events: [],
      actions: [{ type: 'send_text', body: 'hi' }, { type: 'send_text', body: 'still sent?' }],
    });
    const rows = await deps.events.listAll();
    const errs = rows.filter((r) => r.name === EVENT.error_occurred);
    // one error_occurred per action: proves the loop did not stop after the first failure
    expect(errs).toHaveLength(2);
    for (const e of errs) expect(e.properties).toMatchObject({ errorCode: 63016, action: 'send_text' });
  });

  it('refusal: apology copy, generation_failed{reason:refusal}, no error_occurred logged', async () => {
    const deps = makeDeps();
    (deps.generator as FakeGenerator).failWith = new GenerationRefusedError('model refused the topic');
    const t = await makeTeacher(deps, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x' });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'generate', skillId: 'worksheet', topic: 'x' }] });
    expect(updated.state).toBe('AWAITING_TOPIC');
    const rows = await deps.events.listAll();
    const failed = rows.find((r) => r.name === EVENT.generation_failed);
    expect(failed?.properties).toMatchObject({ reason: 'refusal' });
    // a refusal is an expected product signal, not an incident -- it must never be logged as an error
    expect(rows.some((r) => r.name === EVENT.error_occurred)).toBe(false);
    expect((deps.messenger as FakeMessenger).texts().at(-1)).toContain("can't make material on that topic");
  });

  it('generation is called with the UPDATED teacher profile, not the stale pre-update one', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', grade: 'Middle (Classes 6-8)' });
    const step: Step = {
      updates: { grade: 'High (Classes 9-12)' },
      events: [],
      actions: [{ type: 'generate', skillId: 'worksheet', topic: 'x' }],
    };
    await new Executor(deps).runStep(t, step);
    expect((deps.generator as FakeGenerator).calls).toHaveLength(1);
    expect((deps.generator as FakeGenerator).calls[0].grade).toBe('High (Classes 9-12)');
  });
});

import { describe, it, expect } from 'vitest';
import { transition, afterGeneration, buildNudgeStep, MAX_MENU_RETRIES } from '../src/bot/machine.js';
import type { InboundMessage, Step, Teacher } from '../src/domain/types.js';
import { EVENT } from '../src/domain/events.js';
import * as m from '../src/bot/messages.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');
const JOIN = 'https://wa.me/14155238886?text=join%20clever-tiger';
const TZ = 'Asia/Kolkata';

function teacher(over: Partial<Teacher> = {}): Teacher {
  return {
    id: 't1', waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera',
    grade: null, subject: null, board: null, state: 'NEW', currentSkillId: null, pendingTopic: null,
    skillsCompleted: [], retries: 0, activatedAt: null, lastInboundAt: null, nudgeDueAt: null, nudgeSentAt: null,
    nudgeCount: 0, createdAt: NOW, ...over,
  };
}
const onboarded = (over: Partial<Teacher> = {}) => teacher({ grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE', ...over });
const msg = (body: string): InboundMessage => ({ from: 'whatsapp:+911', waId: '911', profileName: 'Meera', body, messageSid: 'SM1', buttonPayload: null });
const run = (t: Teacher, body: string, now = NOW): Step => transition({ teacher: t, message: msg(body), now, joinLink: JOIN, timezone: TZ });
const texts = (s: Step) => s.actions.filter((a) => a.type === 'send_text').map((a) => (a as { body: string }).body);
const names = (s: Step) => s.events.map((e) => e.name);
/** apply a step's updates to a teacher (what the executor does) */
const apply = (t: Teacher, s: Step): Teacher => ({ ...t, ...s.updates, skillsCompleted: s.updates.skillsCompleted ?? t.skillsCompleted });

describe('every inbound', () => {
  it('sets lastInboundAt and logs message_received', () => {
    const s = run(teacher(), 'hi');
    expect(s.updates.lastInboundAt).toEqual(NOW);
    expect(names(s)).toContain(EVENT.message_received);
  });
  it('logs nudge_reopened when replying after a nudge', () => {
    const t = onboarded({ state: 'AWAITING_TOPIC', currentSkillId: 'quiz', nudgeSentAt: new Date(NOW.getTime() - 3_600_000), lastInboundAt: new Date(NOW.getTime() - 86_400_000) });
    expect(names(run(t, 'Photosynthesis'))).toContain(EVENT.nudge_reopened);
    const t2 = { ...t, lastInboundAt: NOW };
    expect(names(run(t2, 'Photosynthesis'))).not.toContain(EVENT.nudge_reopened);
  });
});

describe('onboarding', () => {
  it('NEW -> welcome with grade menu -> AWAITING_GRADE', () => {
    const s = run(teacher(), 'hi');
    expect(s.updates.state).toBe('AWAITING_GRADE');
    expect(texts(s)).toEqual([m.welcome()]);
    expect(names(s)).toContain(EVENT.welcome_sent);
  });
  it('captures grade, subject, board then sends the worksheet micro-lesson', () => {
    let t = apply(teacher(), run(teacher(), 'hi'));
    let s = run(t, '2');
    expect(s.updates.grade).toBe('Middle (Classes 6-8)');
    expect(s.updates.state).toBe('AWAITING_SUBJECT');
    expect(names(s)).toContain(EVENT.grade_captured);
    t = apply(t, s);
    s = run(t, 'maths');
    expect(s.updates.subject).toBe('Maths');
    expect(s.updates.state).toBe('AWAITING_BOARD');
    t = apply(t, s);
    s = run(t, '1');
    expect(s.updates.board).toBe('CBSE');
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('worksheet');
    expect(names(s)).toEqual(expect.arrayContaining([EVENT.board_captured, EVENT.onboarding_completed, EVENT.microlesson_sent]));
    expect(texts(s)[0]).toContain('3-level worksheet');
  });
  it('re-prompts on unrecognised input and accepts free text after MAX_MENU_RETRIES misses', () => {
    let t = teacher({ state: 'AWAITING_GRADE' });
    for (let i = 0; i < MAX_MENU_RETRIES; i++) {
      const s = run(t, 'blah');
      expect(s.updates.retries).toBe(i + 1);
      expect(s.updates.state).toBeUndefined();
      expect(names(s)).toContain(EVENT.unrecognized_input);
      expect(texts(s)[0]).toContain('just the number');
      t = apply(t, s);
    }
    const s = run(t, 'Multiple classes');
    expect(s.updates.grade).toBe('Multiple classes');
    expect(s.updates.state).toBe('AWAITING_SUBJECT');
    expect(s.updates.retries).toBe(0);
    expect(s.events.find((e) => e.name === EVENT.grade_captured)?.properties).toMatchObject({ via: 'free_text' });
  });
});

describe('commands', () => {
  it('help replies with help in any state without changing state', () => {
    const s = run(onboarded({ state: 'AWAITING_TOPIC' }), 'help');
    expect(texts(s)).toEqual([m.help()]);
    expect(s.updates.state).toBeUndefined();
    expect(names(s)).toContain(EVENT.help_requested);
  });
  it('restart clears the profile and restarts onboarding', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'restart');
    expect(s.updates).toMatchObject({ grade: null, subject: null, board: null, state: 'AWAITING_GRADE', currentSkillId: null, pendingTopic: null, retries: 0 });
    expect(names(s)).toContain(EVENT.restarted);
    expect(texts(s)[0]).toContain('starting fresh');
  });
  it('new starts the next skill when onboarded, welcome when not', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'new');
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('quiz');
    expect(texts(s)[0]).toContain('exit ticket');
    const s2 = run(teacher({ state: 'AWAITING_SUBJECT', grade: 'x' }), 'new');
    expect(s2.updates.state).toBe('AWAITING_GRADE');
  });
  it('new is ignored while GENERATING', () => {
    const s = run(onboarded({ state: 'GENERATING', currentSkillId: 'worksheet' }), 'new');
    expect(texts(s)).toEqual([m.stillWorking()]);
  });
});

describe('topic + generation', () => {
  it('rejects acks / PII with the right copy and stays in AWAITING_TOPIC', () => {
    const t = onboarded({ state: 'AWAITING_TOPIC', currentSkillId: 'worksheet' });
    const s = run(t, 'ok');
    expect(s.updates.state).toBeUndefined();
    expect(names(s)).toContain(EVENT.topic_rejected);
    expect(texts(s)[0]).toContain('topic in a few words');
    expect(texts(run(t, 'fractions priya@x.com'))[0]).toContain(`don't share student`);
  });
  it('accepts a topic: ack text + generate action, state GENERATING', () => {
    const s = run(onboarded({ state: 'AWAITING_TOPIC', currentSkillId: 'worksheet' }), 'Comparing fractions');
    expect(s.updates).toMatchObject({ state: 'GENERATING', pendingTopic: 'Comparing fractions', currentSkillId: 'worksheet' });
    expect(s.actions).toEqual([{ type: 'send_text', body: m.generatingAck('worksheet') }, { type: 'generate', skillId: 'worksheet', topic: 'Comparing fractions' }]);
    expect(names(s)).toContain(EVENT.topic_provided);
  });
  it('GENERATING replies still-working', () => {
    const s = run(onboarded({ state: 'GENERATING' }), 'hello?');
    expect(texts(s)).toEqual([m.stillWorking()]);
    expect(names(s)).toContain(EVENT.still_working_sent);
  });
  it('GENERATING older than 2 minutes is treated as failed (process-restart safety)', () => {
    const t = onboarded({ state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', lastInboundAt: new Date(NOW.getTime() - 5 * 60_000) });
    const s = run(t, 'hello?');
    expect(s.updates).toMatchObject({ state: 'AWAITING_TOPIC', pendingTopic: null });
    expect(texts(s)).toEqual([m.generationFailed()]);
    expect(s.events.find((e) => e.name === EVENT.generation_failed)?.properties).toMatchObject({ reason: 'stale' });
  });
});

describe('afterGeneration', () => {
  const t = onboarded({ state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'Comparing fractions' });
  const result = { text: 'TITLE: Fractions\nLEVEL 1 - SUPPORT\n1. q', model: 'm', inputTokens: 1, outputTokens: 2, latencyMs: 3, requestId: null, promptUsed: 'p' };
  it('on success sends chunks+disclaimer, pdf, prompt+impact; activates; AWAITING_IMPACT', () => {
    const s = afterGeneration(t, { ok: true, result, pdfUrl: 'https://x.test/a.pdf' }, NOW);
    const bodies = texts(s);
    expect(bodies[0]).toContain('LEVEL 1 - SUPPORT');
    expect(bodies[0]).toContain(m.disclaimer());
    expect(s.actions.some((a) => a.type === 'send_document' && a.url === 'https://x.test/a.pdf')).toBe(true);
    expect(bodies.at(-1)).toContain('Comparing fractions');
    expect(bodies.at(-1)).toContain('1) About 15 minutes');
    expect(s.updates).toMatchObject({ state: 'AWAITING_IMPACT', activatedAt: NOW, retries: 0 });
    expect(names(s)).toEqual(expect.arrayContaining([EVENT.worksheet_delivered, EVENT.pdf_delivered, EVENT.reusable_prompt_sent, EVENT.impact_prompt_sent, EVENT.activated]));
  });
  it('does not re-activate and notes a missing pdf', () => {
    const s = afterGeneration({ ...t, activatedAt: NOW }, { ok: true, result, pdfUrl: null }, NOW);
    expect(s.updates.activatedAt).toBeUndefined();
    expect(names(s)).toContain(EVENT.pdf_failed);
    expect(names(s)).not.toContain(EVENT.activated);
    expect(texts(s)).toContain(m.pdfFailedNote());
  });
  it('chunks long worksheets at ≤1500 chars', () => {
    const long = { ...result, text: Array.from({ length: 40 }, (_, i) => `${i + 1}. ${'question text '.repeat(8)}`).join('\n') };
    const s = afterGeneration(t, { ok: true, result: long, pdfUrl: null }, NOW);
    const chunks = texts(s).slice(0, -2);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1500)).toBe(true);
  });
  it('on failure apologises and returns to AWAITING_TOPIC', () => {
    const s = afterGeneration(t, { ok: false, reason: 'error' }, NOW);
    expect(s.updates).toMatchObject({ state: 'AWAITING_TOPIC', pendingTopic: null });
    expect(texts(s)).toEqual([m.generationFailed()]);
    expect(names(s)).toContain(EVENT.generation_failed);
    expect(texts(afterGeneration(t, { ok: false, reason: 'refusal' }, NOW))).toEqual([m.generationRefused()]);
  });
});

describe('impact, referral, share, nudge scheduling', () => {
  it('impact -> referral question', () => {
    const s = run(onboarded({ state: 'AWAITING_IMPACT', currentSkillId: 'worksheet' }), '2');
    expect(s.updates.state).toBe('AWAITING_REFERRAL');
    expect(s.events.find((e) => e.name === EVENT.impact_reported)?.properties).toMatchObject({ minutes: 30, skillId: 'worksheet' });
    expect(texts(s)[0]).toContain('colleague');
  });
  it('impact skipped after retries records minutes null', () => {
    const t = onboarded({ state: 'AWAITING_IMPACT', currentSkillId: 'worksheet', retries: MAX_MENU_RETRIES });
    const s = run(t, 'whatever');
    expect(s.updates.state).toBe('AWAITING_REFERRAL');
    expect(s.events.find((e) => e.name === EVENT.impact_reported)?.properties).toMatchObject({ minutes: null });
  });
  it('referral -> share CTA, skill completed, IDLE, nudge scheduled inside the window', () => {
    const t = onboarded({ state: 'AWAITING_REFERRAL', currentSkillId: 'worksheet' });
    const s = run(t, '1');
    expect(s.events.find((e) => e.name === EVENT.referral_reported)?.properties).toMatchObject({ forwarded: true });
    expect(s.updates).toMatchObject({ state: 'IDLE', skillsCompleted: ['worksheet'], currentSkillId: null, nudgeSentAt: null });
    expect(names(s)).toEqual(expect.arrayContaining([EVENT.skill_completed, EVENT.share_cta_sent, EVENT.nudge_scheduled]));
    const due = s.updates.nudgeDueAt as Date;
    expect(due.getTime() - NOW.getTime()).toBeLessThan(24 * 3_600_000);
    expect(due.getTime()).toBeGreaterThan(NOW.getTime());
    expect(texts(s)[0]).toContain(JOIN);
    expect(texts(s)[0]).toContain('exit ticket');
  });
  it('after the last skill no nudge is scheduled', () => {
    const t = onboarded({ state: 'AWAITING_REFERRAL', currentSkillId: 'quiz', skillsCompleted: ['worksheet'] });
    const s = run(t, '2');
    expect(s.updates.skillsCompleted).toEqual(['worksheet', 'quiz']);
    expect(s.updates.nudgeDueAt).toBeUndefined();
    expect(names(s)).not.toContain(EVENT.nudge_scheduled);
  });
  it('IDLE + any text starts the next skill', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'hello');
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('quiz');
  });
});

describe('buildNudgeStep', () => {
  it('sends the next skill micro-lesson and marks the nudge sent', () => {
    const t = onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'], nudgeDueAt: NOW, nudgeSentAt: null });
    const s = buildNudgeStep(t, NOW);
    expect(s.updates).toMatchObject({ state: 'AWAITING_TOPIC', currentSkillId: 'quiz', nudgeSentAt: NOW, nudgeCount: 1, retries: 0 });
    expect(names(s)).toEqual([EVENT.nudge_sent]);
    expect(texts(s)[0]).toContain('exit ticket');
    expect(texts(s)[0].toLowerCase()).toContain('topic');
  });
});

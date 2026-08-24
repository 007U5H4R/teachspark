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
    nudgeCount: 0, createdAt: NOW,
    schoolName: null, schoolLogoUrl: null, paperRequest: null, paperJson: null, paperRedoCount: 0, isTest: false,
    ...over,
  };
}
const onboarded = (over: Partial<Teacher> = {}) => teacher({ grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE', ...over });
const msg = (body: string): InboundMessage => ({ from: 'whatsapp:+911', waId: '911', profileName: 'Meera', body, messageSid: 'SM1', buttonPayload: null, media: [] });
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
  it('NEW -> welcome with the choice menu -> AWAITING_CHOICE', () => {
    const s = run(teacher(), 'hi');
    expect(s.updates.state).toBe('AWAITING_CHOICE');
    expect(texts(s)).toEqual([m.welcome()]);
    expect(names(s)).toContain(EVENT.welcome_sent);
  });
  it('captures grade, subject, board then sends the worksheet micro-lesson', () => {
    let t = apply(teacher(), run(teacher(), 'hi'));
    // pick "Worksheet" at the choice menu; not onboarded yet, so it asks the grade next
    let sChoice = run(t, '1');
    expect(sChoice.updates.state).toBe('AWAITING_GRADE');
    expect(sChoice.updates.currentSkillId).toBe('worksheet');
    expect(names(sChoice)).toContain(EVENT.output_type_selected);
    t = apply(t, sChoice);
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
  it('blocks PII in the free-text fallback and falls back to Other', () => {
    const t = teacher({ state: 'AWAITING_GRADE', retries: MAX_MENU_RETRIES });
    const s = run(t, 'reach me at a@b.com');
    expect(s.updates.grade).toBe('Other');
    expect(s.updates.state).toBe('AWAITING_SUBJECT');
    expect(s.events.find((e) => e.name === EVENT.grade_captured)?.properties).toMatchObject({ via: 'skipped' });
  });
});

describe('commands', () => {
  it('help replies with help in any state without changing state', () => {
    const s = run(onboarded({ state: 'AWAITING_TOPIC' }), 'help');
    expect(texts(s)).toEqual([m.help()]);
    expect(s.updates.state).toBeUndefined();
    expect(s.updates.lastInboundAt).toEqual(NOW);
    expect(names(s)).toContain(EVENT.help_requested);
  });
  it('help during GENERATING keeps the generation clock anchored, so the stale escape stays reachable', () => {
    const t = onboarded({ state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', lastInboundAt: NOW });
    const s1 = run(t, 'help', new Date(NOW.getTime() + 90_000));
    expect(texts(s1)).toEqual([m.help()]);
    expect(s1.updates.state).toBeUndefined();
    expect(s1.updates.lastInboundAt).toBeUndefined();
    const t2 = apply(t, s1);
    expect(t2.lastInboundAt).toEqual(NOW);
    const s2 = run(t2, 'hello?', new Date(NOW.getTime() + 130_000));
    expect(s2.updates.state).toBe('AWAITING_TOPIC');
    expect(s2.events.find((e) => e.name === EVENT.generation_failed)?.properties).toMatchObject({ reason: 'stale' });
  });
  it('restart clears the profile and returns to the choice menu', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'restart');
    expect(s.updates).toMatchObject({ grade: null, subject: null, board: null, state: 'AWAITING_CHOICE', currentSkillId: null, pendingTopic: null, retries: 0 });
    expect(names(s)).toContain(EVENT.restarted);
    expect(texts(s)[0]).toContain('starting fresh');
  });
  it('new shows the choice menu instead of auto-starting a skill (onboarded or not)', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'new');
    expect(s.updates.state).toBe('AWAITING_CHOICE');
    expect(texts(s)).toEqual([m.chooseWhatToMake()]);
    expect(s.updates.currentSkillId).toBeUndefined(); // not started yet
    const s2 = run(teacher({ state: 'AWAITING_SUBJECT', grade: 'x' }), 'new');
    expect(s2.updates.state).toBe('AWAITING_CHOICE');
  });
  it('new is ignored while GENERATING', () => {
    const s = run(onboarded({ state: 'GENERATING', currentSkillId: 'worksheet' }), 'new');
    expect(texts(s)).toEqual([m.stillWorking()]);
  });
});

describe('choice menu (AWAITING_CHOICE)', () => {
  it('onboarded + worksheet -> starts the worksheet skill at AWAITING_TOPIC', () => {
    const s = run(onboarded({ state: 'AWAITING_CHOICE' }), '1');
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('worksheet');
    expect(texts(s)[0]).toContain('3-level worksheet');
    expect(s.events.find((e) => e.name === EVENT.output_type_selected)?.properties).toMatchObject({ choice: 'worksheet', via: 'option' });
  });
  it('onboarded + quiz -> starts the quiz skill even though worksheet is not done', () => {
    const s = run(onboarded({ state: 'AWAITING_CHOICE' }), '2');
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('quiz');
    expect(texts(s)[0]).toContain('exit ticket');
    expect(s.events.find((e) => e.name === EVENT.output_type_selected)?.properties).toMatchObject({ choice: 'quiz' });
  });
  it('onboarded + question paper -> enters the paper wizard', () => {
    const s = run(onboarded({ state: 'AWAITING_CHOICE' }), '3');
    expect(s.updates.state).toBe('PAPER_SUBJECT');
    expect(names(s)).toEqual(expect.arrayContaining([EVENT.output_type_selected, EVENT.paper_started]));
    expect(s.events.find((e) => e.name === EVENT.output_type_selected)?.properties).toMatchObject({ choice: 'paper' });
  });
  it('NOT onboarded + quiz -> remembers the choice and onboards, then starts the remembered quiz', () => {
    let t = teacher({ state: 'AWAITING_CHOICE' });
    let s = run(t, '2');
    expect(s.updates.state).toBe('AWAITING_GRADE');
    expect(s.updates.currentSkillId).toBe('quiz');
    expect(texts(s)[0].toLowerCase()).toContain('grade');
    t = apply(t, s);
    t = apply(t, run(t, '2'));      // grade
    t = apply(t, run(t, 'maths'));  // subject
    s = run(t, '1');                // board -> should start the REMEMBERED quiz, not worksheet
    expect(s.updates.state).toBe('AWAITING_TOPIC');
    expect(s.updates.currentSkillId).toBe('quiz');
    expect(texts(s)[0]).toContain('exit ticket');
  });
  it('NOT onboarded + question paper -> paper wizard with an Other/Other/Other profile', () => {
    const s = run(teacher({ state: 'AWAITING_CHOICE' }), '3');
    expect(s.updates.state).toBe('PAPER_SUBJECT');
    expect(s.updates.paperRequest).toMatchObject({ grade: 'Other', board: 'Other' });
  });
});

describe('clear command', () => {
  it('clear from any state asks for YES/NO confirmation and logs clear_requested', () => {
    const s = run(onboarded({ state: 'AWAITING_TOPIC', currentSkillId: 'quiz', pendingTopic: 'x' }), 'clear');
    expect(s.updates.state).toBe('AWAITING_CLEAR_CONFIRM');
    expect(names(s)).toContain(EVENT.clear_requested);
    expect(texts(s)[0].toLowerCase()).toContain('sure');
  });
  it('confirm YES resets the session, keeps the profile, and lands at the choice menu', () => {
    const t = onboarded({ state: 'AWAITING_CLEAR_CONFIRM', currentSkillId: 'quiz', pendingTopic: 'x', paperRedoCount: 2 });
    const s = run(t, '1');
    expect(s.updates).toMatchObject({ state: 'AWAITING_CHOICE', currentSkillId: null, pendingTopic: null, paperRequest: null, paperJson: null, paperRedoCount: 0 });
    expect(s.updates.grade).toBeUndefined(); // profile untouched
    expect(names(s)).toContain(EVENT.cleared);
    expect(texts(s)[0]).toContain('1) Worksheet');
  });
  it('confirm NO cancels: nothing cleared, goes IDLE', () => {
    const t = onboarded({ state: 'AWAITING_CLEAR_CONFIRM', currentSkillId: 'quiz' });
    const s = run(t, '2');
    expect(s.updates.state).toBe('IDLE');
    expect(s.updates.currentSkillId).toBeUndefined();
    expect(names(s)).toContain(EVENT.clear_cancelled);
    expect(texts(s)[0].toLowerCase()).toContain('nothing was cleared');
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
  it('does not refresh lastInboundAt on a still-working ping, so an impatient teacher still hits the stale escape', () => {
    const t = onboarded({ state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'x', lastInboundAt: NOW });
    const s1 = run(t, 'are you there?', new Date(NOW.getTime() + 90_000));
    expect(texts(s1)).toEqual([m.stillWorking()]);
    expect(s1.updates.lastInboundAt).toBeUndefined();
    const t2 = apply(t, s1);
    expect(t2.lastInboundAt).toEqual(NOW);
    const s2 = run(t2, 'hello?', new Date(NOW.getTime() + 130_000));
    expect(s2.updates.state).toBe('AWAITING_TOPIC');
    expect(s2.events.find((e) => e.name === EVENT.generation_failed)?.properties).toMatchObject({ reason: 'stale' });
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
  it('arms the return nudge at activation, not only at skill completion', () => {
    // The whole point of the fix: completion needs both the impact AND referral answers, and most
    // teachers stop replying once they have the worksheet they came for. In the live pilot 6
    // activated and 1 completed, so 5 of 6 could never be nudged at all.
    const s = afterGeneration(t, { ok: true, result, pdfUrl: null }, NOW);
    expect(names(s)).toContain(EVENT.nudge_scheduled);
    expect(s.updates.nudgeDueAt).toBeInstanceOf(Date);
    expect(s.updates.nudgeDueAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('does not arm a second nudge over a pending one, or re-arm one already sent', () => {
    // Guards against nudge spam for a teacher who generates several worksheets in a row.
    const pending = afterGeneration({ ...t, nudgeDueAt: NOW }, { ok: true, result, pdfUrl: null }, NOW);
    expect(names(pending)).not.toContain(EVENT.nudge_scheduled);
    const alreadyNudged = afterGeneration({ ...t, nudgeSentAt: NOW }, { ok: true, result, pdfUrl: null }, NOW);
    expect(names(alreadyNudged)).not.toContain(EVENT.nudge_scheduled);
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
  it('referral skipped after retries still completes the skill and schedules the nudge', () => {
    const t = onboarded({ state: 'AWAITING_REFERRAL', currentSkillId: 'worksheet', retries: MAX_MENU_RETRIES });
    const s = run(t, 'whatever');
    expect(s.events.find((e) => e.name === EVENT.referral_reported)?.properties).toMatchObject({ forwarded: null });
    expect(s.updates).toMatchObject({ state: 'IDLE', skillsCompleted: ['worksheet'] });
    expect(names(s)).toEqual(expect.arrayContaining([EVENT.skill_completed, EVENT.share_cta_sent, EVENT.nudge_scheduled]));
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
  it('IDLE + any text shows the choice menu', () => {
    const s = run(onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'] }), 'hello');
    expect(s.updates.state).toBe('AWAITING_CHOICE');
    expect(texts(s)).toEqual([m.chooseWhatToMake()]);
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

describe('unrecognised teacher state (runtime safety)', () => {
  it('self-heals into onboarding instead of crashing when the DB state is not a known TeacherState', () => {
    const bogus = { ...teacher(), state: 'WAT' as unknown as Teacher['state'] };
    const s = run(bogus, 'hi');
    expect(s.updates.state).toBe('AWAITING_CHOICE');
    expect(names(s)).toContain(EVENT.welcome_sent);
  });
});

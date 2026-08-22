/**
 * Phase 2 QA gate (independent of the implementers).
 *
 * Case 2 — drives the PURE machine end to end: no I/O, no mocks of the machine itself.
 *          The only thing faked is the generation OUTCOME, which is what the (not yet
 *          built) executor hands back to `afterGeneration`.
 * Case 3 — edge cases around commands, menus, topic validation and nudges.
 *
 * Helpers are copied (not imported) from test/machine.test.ts on purpose: a QA suite must
 * not break when another suite's helpers change.
 */
import { describe, it, expect } from 'vitest';
import { transition, afterGeneration, buildNudgeStep, MAX_CHUNK, MAX_MENU_RETRIES } from '../src/bot/machine.js';
import type { GenerationOutcome, InboundMessage, Step, Teacher, TeacherProfile } from '../src/domain/types.js';
import { EVENT } from '../src/domain/events.js';
import { SKILLS } from '../src/bot/skills.js';
import * as m from '../src/bot/messages.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');
const JOIN = 'https://wa.me/14155238886?text=join%20clever-tiger';
const TZ = 'Asia/Kolkata';
const DAY_MS = 24 * 3_600_000;
/** wall clock helper: `at(30)` = 30 seconds after NOW */
const at = (seconds: number): Date => new Date(NOW.getTime() + seconds * 1000);

function teacher(over: Partial<Teacher> = {}): Teacher {
  return {
    id: 't1', waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera',
    grade: null, subject: null, board: null, state: 'NEW', currentSkillId: null, pendingTopic: null,
    skillsCompleted: [], retries: 0, activatedAt: null, lastInboundAt: null, nudgeDueAt: null, nudgeSentAt: null,
    nudgeCount: 0, createdAt: NOW,
    schoolName: null, schoolLogoUrl: null, paperRequest: null, paperJson: null, paperRedoCount: 0,
    ...over,
  };
}
const onboarded = (over: Partial<Teacher> = {}) => teacher({ grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE', ...over });
const PROFILE: TeacherProfile = { grade: 'Middle (Classes 6-8)', subject: 'Maths', board: 'CBSE' };
const msg = (body: string): InboundMessage => ({ from: 'whatsapp:+911', waId: '911', profileName: 'Meera', body, messageSid: 'SM1', buttonPayload: null, media: [] });
const run = (t: Teacher, body: string, now = NOW): Step => transition({ teacher: t, message: msg(body), now, joinLink: JOIN, timezone: TZ });
const texts = (s: Step) => s.actions.filter((a) => a.type === 'send_text').map((a) => (a as { body: string }).body);
const names = (s: Step) => s.events.map((e) => e.name);
/** apply a step's updates to a teacher (what the executor does) */
const apply = (t: Teacher, s: Step): Teacher => ({ ...t, ...s.updates, skillsCompleted: s.updates.skillsCompleted ?? t.skillsCompleted });

describe('QA Case 2 — simulated full conversation (pure machine, no I/O)', () => {
  /** The fake outcome the executor would hand back after a successful generation + PDF upload. */
  const OUTCOME: GenerationOutcome = {
    ok: true,
    result: {
      text: 'TITLE: Fractions\nLEVEL 1 - SUPPORT\n1. q\n2. q',
      model: 'm', inputTokens: 1, outputTokens: 2, latencyMs: 3, requestId: null, promptUsed: 'p',
    },
    pdfUrl: 'https://x.test/a.pdf',
  };

  /** hi → 2 → maths → 1 → topic → (generation) → 2 → 1, threading the teacher through every step. */
  function drive() {
    let t = teacher();
    const eventNames: string[] = [];
    const bodies: string[] = [];
    const steps: Step[] = [];
    const record = (s: Step) => {
      steps.push(s);
      eventNames.push(...names(s));
      bodies.push(...texts(s));
      t = apply(t, s);
      return s;
    };

    const sWelcome = record(run(t, 'hi', at(0)));
    const sGrade = record(run(t, '2', at(30)));
    const sSubject = record(run(t, 'maths', at(60)));
    const sBoard = record(run(t, '1', at(90)));
    const sTopic = record(run(t, 'Comparing fractions', at(120)));
    const sGenerated = record(afterGeneration(t, OUTCOME, at(150)));
    const sImpact = record(run(t, '2', at(180)));
    const sReferral = record(run(t, '1', at(210)));

    return { t, eventNames, bodies, steps, sWelcome, sGrade, sSubject, sBoard, sTopic, sGenerated, sImpact, sReferral, finalNow: at(210) };
  }

  it('(a) emits the PRD funnel events in exactly this order', () => {
    const expected = [
      EVENT.message_received, EVENT.welcome_sent,
      EVENT.message_received, EVENT.grade_captured,
      EVENT.message_received, EVENT.subject_captured,
      EVENT.message_received, EVENT.board_captured, EVENT.onboarding_completed, EVENT.microlesson_sent,
      EVENT.message_received, EVENT.topic_provided,
      // nudge_scheduled now fires HERE, at activation, as well as at completion below. The return
      // nudge used to be armed only on completion, which requires answering both the impact and
      // referral questions — in the live pilot 6 teachers activated, 1 completed, so 5 could never
      // be nudged. Arming at activation is the fix; the completion one re-arms for the next skill.
      EVENT.worksheet_delivered, EVENT.pdf_delivered, EVENT.reusable_prompt_sent, EVENT.impact_prompt_sent, EVENT.activated,
      EVENT.nudge_scheduled,
      EVENT.message_received, EVENT.impact_reported,
      EVENT.message_received, EVENT.referral_reported, EVENT.skill_completed, EVENT.share_cta_sent, EVENT.nudge_scheduled,
    ];
    expect(drive().eventNames).toEqual(expected);
  });

  it('(b) every send_text body in the conversation is within the WhatsApp chunk limit', () => {
    const { bodies } = drive();
    expect(bodies.length).toBeGreaterThan(0);
    const tooLong = bodies.filter((b) => b.length > MAX_CHUNK);
    expect(tooLong).toEqual([]);
    expect(MAX_CHUNK).toBe(1500);
  });

  it('(c) lands IDLE with the worksheet completed and a nudge due inside the 24h window', () => {
    const { t, sReferral, finalNow } = drive();
    expect(t.state).toBe('IDLE');
    expect(t.skillsCompleted).toEqual(['worksheet']);
    expect(t.currentSkillId).toBeNull();
    expect(t.pendingTopic).toBeNull();
    const due = sReferral.updates.nudgeDueAt as Date;
    expect(due).toBeInstanceOf(Date);
    expect(due.getTime()).toBeGreaterThan(finalNow.getTime());
    expect(due.getTime() - finalNow.getTime()).toBeLessThan(DAY_MS);
    expect(t.nudgeSentAt).toBeNull();
    expect(t.activatedAt).toEqual(at(150));
  });

  it('walks the expected states and hands the executor a generate action + the PDF', () => {
    const { sWelcome, sGrade, sSubject, sBoard, sTopic, sGenerated, sImpact, steps } = drive();
    expect([sWelcome, sGrade, sSubject, sBoard, sTopic, sGenerated, sImpact].map((s) => s.updates.state))
      .toEqual(['AWAITING_GRADE', 'AWAITING_SUBJECT', 'AWAITING_BOARD', 'AWAITING_TOPIC', 'GENERATING', 'AWAITING_IMPACT', 'AWAITING_REFERRAL']);
    expect(sGrade.updates.grade).toBe('Middle (Classes 6-8)');
    expect(sSubject.updates.subject).toBe('Maths');
    expect(sBoard.updates.board).toBe('CBSE');
    expect(sTopic.actions).toContainEqual({ type: 'generate', skillId: 'worksheet', topic: 'Comparing fractions' });
    expect(sGenerated.actions).toContainEqual({ type: 'send_document', url: 'https://x.test/a.pdf' });
    // the generate action is the ONLY non-send action before the fake outcome is applied
    const preGenerate = steps.slice(0, 5).flatMap((s) => s.actions).filter((a) => a.type !== 'send_text');
    expect(preGenerate).toEqual([{ type: 'generate', skillId: 'worksheet', topic: 'Comparing fractions' }]);
  });

  it('delivers the worksheet with the AI disclaimer, the reusable prompt and the share link', () => {
    const { bodies } = drive();
    expect(bodies.some((b) => b.includes('LEVEL 1 - SUPPORT'))).toBe(true);
    expect(bodies.some((b) => b.includes(m.disclaimer()))).toBe(true);
    expect(bodies.some((b) => b.includes(SKILLS.worksheet.reusablePrompt(PROFILE, 'Comparing fractions')))).toBe(true);
    expect(bodies.at(-1)).toContain(JOIN);
    expect(bodies.at(-1)).toContain(SKILLS.quiz.title);
  });
});

describe('QA Case 3 — edge cases', () => {
  it('a repeated "hi" in NEW welcomes twice and does not crash', () => {
    const t = teacher();
    const first = run(t, 'hi');
    const second = run(t, 'hi'); // duplicate webhook: state was not persisted in between
    expect(texts(first)).toEqual([m.welcome()]);
    expect(texts(second)).toEqual([m.welcome()]);
    expect(second.updates.state).toBe('AWAITING_GRADE');
    // and when the first step WAS applied, the second "hi" re-prompts instead of crashing
    const third = run(apply(t, first), 'hi');
    expect(names(third)).toEqual([EVENT.message_received, EVENT.unrecognized_input]);
    expect(texts(third)[0]).toContain('just the number');
  });

  it('restart mid-onboarding clears the profile and returns to AWAITING_GRADE', () => {
    const t = teacher({ state: 'AWAITING_BOARD', grade: 'Middle (Classes 6-8)', subject: 'Maths', retries: 2 });
    const s = run(t, 'restart');
    expect(s.updates).toMatchObject({ grade: null, subject: null, board: null, currentSkillId: null, pendingTopic: null, state: 'AWAITING_GRADE', retries: 0 });
    expect(names(s)).toEqual([EVENT.message_received, EVENT.restarted, EVENT.welcome_sent]);
    const after = apply(t, s);
    expect([after.grade, after.subject, after.board]).toEqual([null, null, null]);
    expect(after.state).toBe('AWAITING_GRADE');
  });

  it('help during GENERATING answers, keeps the state, and does not refresh lastInboundAt', () => {
    const t = onboarded({ state: 'GENERATING', currentSkillId: 'worksheet', pendingTopic: 'Comparing fractions', lastInboundAt: NOW });
    const s = run(t, 'help', at(45));
    expect(texts(s)).toEqual([m.help()]);
    expect(names(s)).toEqual([EVENT.message_received, EVENT.help_requested]);
    expect(s.updates.state).toBeUndefined();
    expect(s.updates.lastInboundAt).toBeUndefined();
    expect(apply(t, s).lastInboundAt).toEqual(NOW); // generation clock stays anchored to the topic message
  });

  it('rejects an ack, an emoji-only reply and PII as topics, staying in AWAITING_TOPIC', () => {
    const t = onboarded({ state: 'AWAITING_TOPIC', currentSkillId: 'worksheet' });
    const reason = (body: string) => {
      const s = run(t, body);
      expect(s.updates.state).toBeUndefined();
      expect(s.updates.pendingTopic).toBeUndefined();
      expect(s.actions.some((a) => a.type === 'generate')).toBe(false);
      expect(names(s)).toContain(EVENT.topic_rejected);
      return s.events.find((e) => e.name === EVENT.topic_rejected)?.properties?.reason;
    };
    expect(reason('ok')).toBe('ack');
    expect(reason('👍')).toBe('ack');
    expect(reason('Fractions, ask priya@school.in')).toBe('pii');
    expect(texts(run(t, 'Fractions, ask priya@school.in'))[0]).toContain(`don't share student`);
  });

  it('accepts free text on the grade menu after 3 misses', () => {
    expect(MAX_MENU_RETRIES).toBe(2); // 2 re-prompts, so the 3rd miss is the one that resolves
    let t = teacher({ state: 'AWAITING_GRADE' });
    for (let i = 0; i < MAX_MENU_RETRIES; i++) {
      const s = run(t, 'blah');
      expect(s.updates.state).toBeUndefined();
      expect(names(s)).toContain(EVENT.unrecognized_input);
      t = apply(t, s);
    }
    const s = run(t, 'Multiple classes');
    expect(s.updates.grade).toBe('Multiple classes');
    expect(s.updates.state).toBe('AWAITING_SUBJECT');
    expect(s.events.find((e) => e.name === EVENT.grade_captured)?.properties).toMatchObject({ via: 'free_text' });
  });

  it('skips the impact and referral menus after 3 misses instead of taking free text', () => {
    let t = onboarded({ state: 'AWAITING_IMPACT', currentSkillId: 'worksheet' });
    for (let i = 0; i < MAX_MENU_RETRIES; i++) t = apply(t, run(t, 'not a number'));
    const impact = run(t, 'sometime i guess');
    expect(impact.updates.state).toBe('AWAITING_REFERRAL');
    expect(impact.events.find((e) => e.name === EVENT.impact_reported)?.properties).toMatchObject({ minutes: null, via: 'skipped' });
    t = apply(t, impact);

    // NB: "no idea" would MATCH the "No" option via parseOption's leading-token rule — this text misses on purpose
    for (let i = 0; i < MAX_MENU_RETRIES; i++) t = apply(t, run(t, 'not sure at all'));
    const referral = run(t, 'cannot remember');
    expect(referral.events.find((e) => e.name === EVENT.referral_reported)?.properties).toMatchObject({ forwarded: null, via: 'skipped' });
    expect(referral.updates).toMatchObject({ state: 'IDLE', skillsCompleted: ['worksheet'] });
    expect(names(referral)).toContain(EVENT.skill_completed);
  });

  it('logs nudge_reopened only when the reply is the first inbound after a nudge', () => {
    const nudged = onboarded({
      state: 'AWAITING_TOPIC', currentSkillId: 'quiz', skillsCompleted: ['worksheet'],
      nudgeSentAt: at(-3600), lastInboundAt: at(-20 * 3600), nudgeCount: 1,
    });
    expect(names(run(nudged, 'Photosynthesis'))).toContain(EVENT.nudge_reopened);
    const alreadyReplied = { ...nudged, lastInboundAt: at(-60) };
    expect(names(run(alreadyReplied, 'Photosynthesis'))).not.toContain(EVENT.nudge_reopened);
  });

  it('the nudge opens skill 2 with the exit-ticket micro-lesson and its topic goes to the quiz skill', () => {
    const t = onboarded({ state: 'IDLE', skillsCompleted: ['worksheet'], nudgeDueAt: at(-60), lastInboundAt: at(-20 * 3600) });
    const nudge = buildNudgeStep(t, NOW);
    expect(nudge.updates).toMatchObject({ state: 'AWAITING_TOPIC', currentSkillId: 'quiz', retries: 0, pendingTopic: null, nudgeSentAt: NOW, nudgeCount: 1 });
    expect(names(nudge)).toEqual([EVENT.nudge_sent]);
    expect(texts(nudge)).toEqual([m.nudge(SKILLS.quiz, PROFILE)]);
    expect(texts(nudge)[0]).toContain(SKILLS.quiz.title);
    expect(texts(nudge)[0].length).toBeLessThanOrEqual(MAX_CHUNK);

    const reply = run(apply(t, nudge), 'Photosynthesis: inputs and outputs', at(60));
    expect(names(reply)).toContain(EVENT.nudge_reopened);
    expect(reply.updates).toMatchObject({ state: 'GENERATING', currentSkillId: 'quiz', pendingTopic: 'Photosynthesis: inputs and outputs' });
    expect(reply.actions).toContainEqual({ type: 'generate', skillId: 'quiz', topic: 'Photosynthesis: inputs and outputs' });
  });

  it('schedules no nudge once both skills are done', () => {
    const t = onboarded({ state: 'AWAITING_REFERRAL', currentSkillId: 'quiz', skillsCompleted: ['worksheet'] });
    const s = run(t, '2');
    expect(s.updates.skillsCompleted).toEqual(['worksheet', 'quiz']);
    expect(names(s)).not.toContain(EVENT.nudge_scheduled);
    expect(s.updates.nudgeDueAt).toBeUndefined();
    expect(apply(t, s).nudgeDueAt).toBeNull();
    expect(texts(s)[0]).toContain('last skill');
  });
});

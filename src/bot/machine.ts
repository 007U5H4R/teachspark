import type { Action, CoreTeacherState, EventRecord, GenerationOutcome, InboundMessage, SkillId, Step, Teacher, TeacherProfile, TeacherUpdate } from '../domain/types.js';
import { isPaperState } from '../domain/types.js';
import { EVENT } from '../domain/events.js';
import { SKILLS, hasNextSkill, nextSkillFor } from './skills.js';
import * as msg from './messages.js';
import {
  BOARD_OPTIONS, CHOICE_OPTIONS, CONFIRM_OPTIONS, FREE_TEXT_MAX, GRADE_OPTIONS, IMPACT_OPTIONS,
  REFERRAL_OPTIONS, SUBJECT_OPTIONS,
  chunkText, containsPii, parseCommand, parseOption, renderMenu, validateTopic, type Option,
} from './parse.js';
import { computeNudgeDueAt } from './nudge.js';
import { startPaperWizard, paperTransition } from './paper/wizard.js';

export const MAX_MENU_RETRIES = 2;
export const MAX_CHUNK = 1500;
export const STALE_GENERATION_MS = 120_000; // GENERATING older than this ⇒ the process died mid-generation

export interface MachineContext {
  teacher: Teacher;
  message: InboundMessage;
  now: Date;
  joinLink: string;
  timezone: string;
}

const text = (body: string): Action => ({ type: 'send_text', body });

export function profileOf(t: Teacher): TeacherProfile | null {
  return t.grade && t.subject && t.board ? { grade: t.grade, subject: t.subject, board: t.board } : null;
}

function newStep(t: Teacher, now: Date): Step {
  const events: EventRecord[] = [{ name: EVENT.message_received, properties: { state: t.state } }];
  if (t.nudgeSentAt && (!t.lastInboundAt || t.lastInboundAt.getTime() < t.nudgeSentAt.getTime())) {
    events.push({ name: EVENT.nudge_reopened, properties: { nudgeCount: t.nudgeCount } });
  }
  return { updates: { lastInboundAt: now }, events, actions: [] };
}

function welcome(step: Step): Step {
  step.updates.state = 'AWAITING_CHOICE';
  step.updates.retries = 0;
  step.events.push({ name: EVENT.welcome_sent });
  step.actions.push(text(msg.welcome()));
  return step;
}

/** Show the shorter "what would you like to make?" choice menu (NEW/MENU, IDLE, choice reprompt). */
function chooseMenu(step: Step): Step {
  step.updates.state = 'AWAITING_CHOICE';
  step.updates.retries = 0;
  step.actions.push(text(msg.chooseWhatToMake()));
  return step;
}

function startSkill(t: Teacher, step: Step, profile: TeacherProfile, skillId?: SkillId): Step {
  const skill = SKILLS[skillId ?? nextSkillFor(t.skillsCompleted)];
  Object.assign(step.updates, { state: 'AWAITING_TOPIC', currentSkillId: skill.id, retries: 0, pendingTopic: null } satisfies TeacherUpdate);
  step.events.push({ name: EVENT.microlesson_sent, skillId: skill.id });
  step.actions.push(text(skill.microLesson(profile)));
  return step;
}

interface MenuResult {
  value: string | null; // null = skipped after retries with no usable text
  via: 'option' | 'free_text' | 'skipped';
  option: Option | null;
}

/** Returns null when the machine should just re-prompt (and has done so). */
function resolveMenu(t: Teacher, step: Step, body: string, options: Option[], allowFreeText: boolean): MenuResult | null {
  const opt = parseOption(body, options);
  if (opt) {
    step.updates.retries = 0;
    return { value: opt.label, via: 'option', option: opt };
  }
  const retries = t.retries + 1;
  if (retries <= MAX_MENU_RETRIES) {
    step.updates.retries = retries;
    step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, body: body.slice(0, 80) } });
    step.actions.push(text(msg.pleaseReplyWithNumber(renderMenu(options))));
    return null;
  }
  step.updates.retries = 0;
  const free = body.trim().slice(0, FREE_TEXT_MAX);
  return allowFreeText && free.length > 0 && !containsPii(free)
    ? { value: free, via: 'free_text', option: null }
    : { value: null, via: 'skipped', option: null };
}

function completeSkillAndShare(t: Teacher, step: Step, ctx: MachineContext): Step {
  const skillId = t.currentSkillId ?? nextSkillFor(t.skillsCompleted);
  const completed = t.skillsCompleted.includes(skillId) ? [...t.skillsCompleted] : [...t.skillsCompleted, skillId];
  const next = hasNextSkill(completed) ? SKILLS[nextSkillFor(completed)] : null;
  Object.assign(step.updates, { state: 'IDLE', skillsCompleted: completed, currentSkillId: null, pendingTopic: null, retries: 0 } satisfies TeacherUpdate);
  step.events.push({ name: EVENT.skill_completed, skillId }, { name: EVENT.share_cta_sent, skillId });
  step.actions.push(text(msg.shareCta(ctx.joinLink, next ? next.title : null)));
  if (next) {
    const dueAt = computeNudgeDueAt(ctx.now, ctx.timezone);
    step.updates.nudgeDueAt = dueAt;
    step.updates.nudgeSentAt = null;
    step.events.push({ name: EVENT.nudge_scheduled, skillId: next.id, properties: { dueAt: dueAt.toISOString() } });
  }
  return step;
}

export function transition(ctx: MachineContext): Step {
  const { teacher: t, message, now } = ctx;
  const step = newStep(t, now);
  const body = message.body ?? '';
  const cmd = parseCommand(body);
  const profile = profileOf(t);

  if (cmd === 'help') {
    step.events.push({ name: EVENT.help_requested });
    step.actions.push(text(msg.help()));
    // Same reason as the still-working path: while GENERATING (worksheet) or PAPER_GENERATING
    // (paper), keep lastInboundAt anchored to the message that started generation, so the
    // stale-generation escape stays reachable for a teacher who repeatedly asks for help instead
    // of sending free text. This matters even more for PAPER_GENERATING — a paper takes 2-4
    // minutes (vs. a worksheet's ~10s), so an impatient teacher pinging mid-wait is far more likely.
    if (t.state === 'GENERATING' || t.state === 'PAPER_GENERATING') delete step.updates.lastInboundAt;
    return step;
  }
  if (cmd === 'restart') {
    Object.assign(step.updates, {
      grade: null, subject: null, board: null, currentSkillId: null, pendingTopic: null, state: 'AWAITING_CHOICE', retries: 0,
      paperRequest: null, paperJson: null, paperRedoCount: 0,
    } satisfies TeacherUpdate);
    step.events.push({ name: EVENT.restarted }, { name: EVENT.welcome_sent });
    step.actions.push(text(msg.restarted()));
    return step;
  }
  if (cmd === 'clear') {
    Object.assign(step.updates, { state: 'AWAITING_CLEAR_CONFIRM', retries: 0 } satisfies TeacherUpdate);
    step.events.push({ name: EVENT.clear_requested });
    step.actions.push(text(msg.clearConfirm()));
    return step;
  }
  if (cmd === 'new' && t.state !== 'GENERATING' && t.state !== 'PAPER_GENERATING') {
    return chooseMenu(step);
  }
  if (cmd === 'paper' && t.state !== 'GENERATING' && t.state !== 'PAPER_GENERATING') {
    return profile ? startPaperWizard(t, step, profile) : welcome(step);
  }
  if (isPaperState(t.state)) {
    return paperTransition(ctx, step);
  }

  const coreState = t.state as CoreTeacherState;
  switch (coreState) {
    case 'NEW':
      return welcome(step);

    case 'AWAITING_CHOICE': {
      const r = resolveMenu(t, step, body, CHOICE_OPTIONS, false);
      if (!r) return step;
      const choice = (r.option?.id ?? 'worksheet') as 'worksheet' | 'quiz' | 'paper';
      step.events.push({ name: EVENT.output_type_selected, properties: { choice, via: r.via } });
      if (choice === 'paper') {
        const p: TeacherProfile = profile ?? { grade: 'Other', subject: 'Other', board: 'Other' };
        return startPaperWizard(t, step, p);
      }
      // worksheet | quiz
      if (profile) return startSkill(t, step, profile, choice);
      // Not onboarded yet: remember the choice and collect grade → subject → board first.
      Object.assign(step.updates, { currentSkillId: choice, state: 'AWAITING_GRADE', retries: 0 } satisfies TeacherUpdate);
      step.actions.push(text(msg.askGrade()));
      return step;
    }

    case 'AWAITING_CLEAR_CONFIRM': {
      const r = resolveMenu(t, step, body, CONFIRM_OPTIONS, false);
      if (!r) return step;
      if (r.option?.id === 'yes') {
        // Reset only the current session; KEEP grade/subject/board (the profile). Deletes nothing.
        Object.assign(step.updates, {
          currentSkillId: null, pendingTopic: null, paperRequest: null, paperJson: null, paperRedoCount: 0,
          retries: 0, state: 'AWAITING_CHOICE',
        } satisfies TeacherUpdate);
        step.events.push({ name: EVENT.cleared });
        step.actions.push(text(msg.cleared()));
        return step;
      }
      // 'no' or skipped after retries: leave everything intact.
      step.updates.state = 'IDLE';
      step.events.push({ name: EVENT.clear_cancelled });
      step.actions.push(text(msg.clearCancelled()));
      return step;
    }

    case 'AWAITING_GRADE': {
      const r = resolveMenu(t, step, body, GRADE_OPTIONS, true);
      if (!r) return step;
      step.updates.grade = r.value ?? 'Other';
      step.updates.state = 'AWAITING_SUBJECT';
      step.events.push({ name: EVENT.grade_captured, properties: { value: step.updates.grade, via: r.via } });
      step.actions.push(text(r.via === 'option' ? msg.askSubject() : msg.acceptedFreeText(step.updates.grade, msg.askSubject())));
      return step;
    }

    case 'AWAITING_SUBJECT': {
      const r = resolveMenu(t, step, body, SUBJECT_OPTIONS, true);
      if (!r) return step;
      step.updates.subject = r.value ?? 'Other';
      step.updates.state = 'AWAITING_BOARD';
      step.events.push({ name: EVENT.subject_captured, properties: { value: step.updates.subject, via: r.via } });
      step.actions.push(text(r.via === 'option' ? msg.askBoard() : msg.acceptedFreeText(step.updates.subject, msg.askBoard())));
      return step;
    }

    case 'AWAITING_BOARD': {
      const r = resolveMenu(t, step, body, BOARD_OPTIONS, true);
      if (!r) return step;
      const board = r.value ?? 'Other';
      step.updates.board = board;
      step.events.push({ name: EVENT.board_captured, properties: { value: board, via: r.via } }, { name: EVENT.onboarding_completed });
      const p: TeacherProfile = { grade: t.grade ?? 'Other', subject: t.subject ?? 'Other', board };
      // Start the skill she picked at the choice menu (remembered in currentSkillId), not just the
      // next uncompleted skill — so choosing "Quiz" before onboarding still lands her on the quiz.
      return startSkill(t, step, p, t.currentSkillId ?? undefined);
    }

    case 'AWAITING_TOPIC': {
      if (!profile) return welcome(step);
      const skillId = t.currentSkillId ?? nextSkillFor(t.skillsCompleted);
      const skill = SKILLS[skillId];
      const v = validateTopic(body);
      if (!v.ok) {
        step.events.push({ name: EVENT.topic_rejected, skillId, properties: { reason: v.reason } });
        step.actions.push(text(msg.topicRejected(v.reason, skill)));
        return step;
      }
      Object.assign(step.updates, { state: 'GENERATING', pendingTopic: v.topic, currentSkillId: skillId, retries: 0 } satisfies TeacherUpdate);
      step.events.push({ name: EVENT.topic_provided, skillId, properties: { topic: v.topic } });
      step.actions.push(text(msg.generatingAck(skill.outputNoun)), { type: 'generate', skillId, topic: v.topic });
      return step;
    }

    case 'GENERATING': {
      const stale = t.lastInboundAt !== null && now.getTime() - t.lastInboundAt.getTime() > STALE_GENERATION_MS;
      if (stale) {
        Object.assign(step.updates, { state: 'AWAITING_TOPIC', pendingTopic: null, retries: 0 } satisfies TeacherUpdate);
        step.events.push({ name: EVENT.generation_failed, skillId: t.currentSkillId, properties: { reason: 'stale' } });
        step.actions.push(text(msg.generationFailed()));
        return step;
      }
      step.events.push({ name: EVENT.still_working_sent });
      step.actions.push(text(msg.stillWorking()));
      // Keep the generation clock anchored to the topic message: refreshing lastInboundAt on
      // every "still working" ping would make the stale check below unreachable for an
      // impatient teacher. Understating lastInboundAt is safe for the Twilio 24h window.
      delete step.updates.lastInboundAt;
      return step;
    }

    case 'AWAITING_IMPACT': {
      const r = resolveMenu(t, step, body, IMPACT_OPTIONS, false);
      if (!r) return step;
      const skillId = t.currentSkillId ?? nextSkillFor(t.skillsCompleted);
      const minutes = r.option ? Number(r.option.id) : null;
      step.updates.state = 'AWAITING_REFERRAL';
      step.events.push({ name: EVENT.impact_reported, skillId, properties: { minutes, skillId, via: r.via } });
      step.actions.push(text(msg.referralQuestion(r.option ? r.option.label : null)));
      return step;
    }

    case 'AWAITING_REFERRAL': {
      const r = resolveMenu(t, step, body, REFERRAL_OPTIONS, false);
      if (!r) return step;
      const forwarded = r.option ? r.option.id === 'yes' : null;
      step.events.push({ name: EVENT.referral_reported, properties: { forwarded, via: r.via } });
      return completeSkillAndShare(t, step, ctx);
    }

    case 'IDLE':
      return chooseMenu(step);

    default: {
      // Compile-time: this switch is exhaustive over CoreTeacherState ONLY — adding a
      // CoreTeacherState without a case here makes this assignment fail. It does NOT guard
      // PaperState: those never reach this switch, because the isPaperState(t.state) check
      // above delegates every PAPER_* state to paperTransition() in paper/wizard.ts, whose own
      // switch is separately exhaustive over PaperState. The two switches together cover all of
      // TeacherState (= CoreTeacherState | PaperState) — but each is independently compiler-guarded
      // over its own half, not this one over the whole union.
      const _exhaustive: never = coreState;
      void _exhaustive;
      // Runtime: an unexpected DB value self-heals into onboarding instead of crashing.
      return welcome(step);
    }
  }
}

export function afterGeneration(t: Teacher, outcome: GenerationOutcome, now: Date, timezone = 'Asia/Kolkata'): Step {
  const skillId = t.currentSkillId ?? nextSkillFor(t.skillsCompleted);
  const skill = SKILLS[skillId];
  const topic = t.pendingTopic ?? '';
  const step: Step = { updates: {}, events: [], actions: [] };

  if (!outcome.ok) {
    Object.assign(step.updates, { state: 'AWAITING_TOPIC', pendingTopic: null, retries: 0 } satisfies TeacherUpdate);
    step.events.push({ name: EVENT.generation_failed, skillId, properties: { reason: outcome.reason } });
    step.actions.push(text(outcome.reason === 'refusal' ? msg.generationRefused() : msg.generationFailed()));
    return step;
  }

  const profile: TeacherProfile = profileOf(t) ?? { grade: t.grade ?? 'Other', subject: t.subject ?? 'Other', board: t.board ?? 'Other' };
  const chunks = chunkText(`${outcome.result.text.trim()}\n\n${msg.disclaimer()}`, MAX_CHUNK);
  for (const c of chunks) step.actions.push(text(c));
  step.events.push({
    name: EVENT.worksheet_delivered,
    skillId,
    properties: { chunks: chunks.length, topic, model: outcome.result.model, outputTokens: outcome.result.outputTokens, latencyMs: outcome.result.latencyMs },
  });
  if (outcome.pdfUrl) {
    step.actions.push({ type: 'send_document', url: outcome.pdfUrl });
    step.events.push({ name: EVENT.pdf_delivered, skillId, properties: { url: outcome.pdfUrl } });
  } else {
    step.actions.push(text(msg.pdfFailedNote()));
    step.events.push({ name: EVENT.pdf_failed, skillId });
  }
  step.actions.push(text(msg.reusablePromptAndImpact(skill.reusablePrompt(profile, topic))));
  step.events.push({ name: EVENT.reusable_prompt_sent, skillId }, { name: EVENT.impact_prompt_sent, skillId });
  if (!t.activatedAt) {
    step.updates.activatedAt = now;
    step.events.push({ name: EVENT.activated, skillId });
  }
  // Schedule the return nudge HERE, at activation, not at skill completion.
  //
  // Completion requires answering both the impact and the referral question, and most teachers
  // stop replying once they have their worksheet — the reason they came. In the live pilot 6
  // people received a worksheet, 2 answered impact and 1 answered referral, so exactly one nudge
  // was ever scheduled and 5 of 6 activated teachers could never be nudged at all.
  //
  // Guarded on both fields so this cannot spam: it never overwrites a nudge already pending, and
  // never re-arms one that has already been sent. completeSkillAndShare still re-arms on its own
  // terms by clearing nudgeSentAt.
  if (!t.nudgeSentAt && !t.nudgeDueAt) {
    const dueAt = computeNudgeDueAt(now, timezone);
    step.updates.nudgeDueAt = dueAt;
    step.events.push({ name: EVENT.nudge_scheduled, skillId, properties: { dueAt: dueAt.toISOString(), trigger: 'activation' } });
  }
  Object.assign(step.updates, { state: 'AWAITING_IMPACT', retries: 0 } satisfies TeacherUpdate);
  return step;
}

export function buildNudgeStep(t: Teacher, now: Date): Step {
  const skillId = nextSkillFor(t.skillsCompleted);
  const skill = SKILLS[skillId];
  const profile: TeacherProfile = profileOf(t) ?? { grade: t.grade ?? 'Other', subject: t.subject ?? 'Other', board: t.board ?? 'Other' };
  return {
    updates: { state: 'AWAITING_TOPIC', currentSkillId: skillId, retries: 0, pendingTopic: null, nudgeSentAt: now, nudgeCount: t.nudgeCount + 1 },
    events: [{ name: EVENT.nudge_sent, skillId, properties: { nudgeCount: t.nudgeCount + 1 } }],
    actions: [text(msg.nudge(skill, profile))],
  };
}

import type {
  Action, PaperAssessmentType, PaperGenerationOutcome, PaperJson, PaperRequest, PaperState,
  PaperTierId, Step, Teacher, TeacherProfile, TeacherUpdate,
} from '../../domain/types.js';
import { isLessonMediaType } from '../../domain/types.js';
import { EVENT } from '../../domain/events.js';
import { chunkText, parseOption, type Option } from '../parse.js';
import { validateTopic } from '../parse.js';
import { MAX_MENU_RETRIES, type MachineContext } from '../machine.js';
import {
  LANGUAGE_OPTIONS, MAX_PAPER_MEDIA, MAX_PAPER_REDOS, PAPER_IMPACT_OPTIONS, PAPER_KEY_OPTIONS,
  PAPER_STALE_MS, PAPER_TIER_OPTIONS, PAPER_TYPE_OPTIONS, PREVIEW_OPTIONS,
} from './options.js';
import * as copy from './copy.js';
import * as msg from '../messages.js';
import { paperShapeIssues } from './prompts.js';

export * from './options.js'; // tests and machine.ts import everything via wizard.js

const text = (body: string): Action => ({ type: 'send_text', body });

function freshRequest(profile: TeacherProfile): PaperRequest {
  return {
    subject: '', language: '', grade: profile.grade, board: profile.board, chapter: '',
    assessmentType: 'worksheet', tiers: ['A', 'B', 'C'], teacherVersion: true, media: [], adjustment: null,
  };
}

export function startPaperWizard(t: Teacher, step: Step, profile: TeacherProfile): Step {
  Object.assign(step.updates, {
    state: 'PAPER_SUBJECT', paperRequest: freshRequest(profile), paperJson: null, paperRedoCount: 0, retries: 0,
  } satisfies TeacherUpdate);
  step.events.push({ name: EVENT.paper_started });
  step.actions.push(text(copy.askLanguage()));
  return step;
}

function startGeneration(step: Step, request: PaperRequest): Step {
  Object.assign(step.updates, { state: 'PAPER_GENERATING', paperRequest: request, retries: 0 } satisfies TeacherUpdate);
  step.actions.push(text(copy.paperGeneratingAck()), { type: 'generate_paper' });
  return step;
}

/** Menu resolution with the core machine's retry pattern, but falling back to a default option. */
function resolveMenuOrDefault(t: Teacher, step: Step, body: string, options: Option[], defaultId: string, reprompt: string): Option | null {
  const opt = parseOption(body, options);
  if (opt) {
    step.updates.retries = 0;
    return opt;
  }
  const retries = t.retries + 1;
  if (retries <= MAX_MENU_RETRIES) {
    step.updates.retries = retries;
    step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, body: body.slice(0, 80) } });
    step.actions.push(text(reprompt));
    return null;
  }
  step.updates.retries = 0;
  return options.find((o) => o.id === defaultId) ?? options[0];
}

export function paperTransition(ctx: MachineContext, step: Step): Step {
  const { teacher: t, message, now } = ctx;
  const body = (message.body ?? '').trim();
  const lower = body.toLowerCase();
  const request = t.paperRequest ?? freshRequest({ grade: t.grade ?? 'Other', subject: t.subject ?? 'Other', board: t.board ?? 'Other' });

  switch (t.state as PaperState) {
    case 'PAPER_SUBJECT': {
      const opt = parseOption(body, LANGUAGE_OPTIONS);
      let language = opt ? opt.label : null;
      if (!language && body.length >= 3 && body.length <= 30 && !/\d/.test(body)) {
        language = body.charAt(0).toUpperCase() + body.slice(1); // free text names a regional language
      }
      if (!language) {
        const retries = t.retries + 1;
        if (retries <= MAX_MENU_RETRIES) {
          step.updates.retries = retries;
          step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, body: body.slice(0, 80) } });
          step.actions.push(text(copy.askLanguage()));
          return step;
        }
        language = 'English';
      }
      step.updates.retries = 0;
      step.updates.paperRequest = { ...request, subject: language, language };
      step.updates.state = 'PAPER_CHAPTER';
      step.events.push({ name: EVENT.paper_subject_captured, properties: { value: language } });
      step.actions.push(text(copy.askChapter(language)));
      return step;
    }

    case 'PAPER_CHAPTER': {
      const v = validateTopic(body); // reuses the ack/PII/length guards
      if (!v.ok) {
        step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, reason: v.reason } });
        // M3: explain WHY, mirroring how the core loop's AWAITING_TOPIC uses msg.topicRejected(reason, skill)
        // instead of one generic re-ask for every rejection reason.
        step.actions.push(text(copy.askChapterRejected(v.reason, request.language || 'the')));
        return step;
      }
      step.updates.paperRequest = { ...request, chapter: v.topic };
      step.updates.state = 'PAPER_MEDIA';
      step.events.push({ name: EVENT.paper_chapter_captured, properties: { value: v.topic } });
      step.actions.push(text(copy.askMedia(MAX_PAPER_MEDIA)));
      return step;
    }

    case 'PAPER_MEDIA': {
      const items = message.media ?? [];
      if (items.length > 0) {
        const media = [...request.media];
        for (const m of items) {
          if (!isLessonMediaType(m.contentType)) {
            step.events.push({ name: EVENT.paper_media_rejected, properties: { contentType: m.contentType } });
            step.actions.push(text(copy.mediaRejected()));
            continue;
          }
          if (media.length >= MAX_PAPER_MEDIA) {
            step.events.push({ name: EVENT.paper_media_rejected, properties: { reason: 'limit' } });
            step.actions.push(text(copy.mediaLimit(MAX_PAPER_MEDIA)));
            continue;
          }
          media.push({ url: m.url, contentType: m.contentType });
          step.events.push({ name: EVENT.paper_media_received, properties: { count: media.length } });
          step.actions.push(text(copy.mediaReceived(media.length, MAX_PAPER_MEDIA)));
        }
        step.updates.paperRequest = { ...request, media };
        return step;
      }
      if (lower === 'skip' || (lower === 'done' && request.media.length > 0)) {
        step.updates.state = 'PAPER_TYPE';
        step.updates.retries = 0;
        step.events.push({ name: EVENT.paper_media_done, properties: { count: request.media.length } });
        step.actions.push(text(copy.askType()));
        return step;
      }
      step.actions.push(text(copy.mediaHint()));
      return step;
    }

    case 'PAPER_TYPE': {
      const r = resolveMenuOrDefault(t, step, body, PAPER_TYPE_OPTIONS, 'worksheet', copy.askType());
      if (!r) return step;
      step.updates.paperRequest = { ...request, assessmentType: r.id as PaperAssessmentType };
      step.updates.state = 'PAPER_TIERS';
      step.events.push({ name: EVENT.paper_type_captured, properties: { value: r.id } });
      step.actions.push(text(copy.askTiers()));
      return step;
    }

    case 'PAPER_TIERS': {
      const r = resolveMenuOrDefault(t, step, body, PAPER_TIER_OPTIONS, 'all', copy.askTiers());
      if (!r) return step;
      const tiers: PaperTierId[] = r.id === 'all' ? ['A', 'B', 'C'] : [r.id.toUpperCase() as PaperTierId];
      step.updates.paperRequest = { ...request, tiers };
      step.updates.state = 'PAPER_KEY';
      step.events.push({ name: EVENT.paper_tiers_captured, properties: { tiers } });
      step.actions.push(text(copy.askKey()));
      return step;
    }

    case 'PAPER_KEY': {
      const r = resolveMenuOrDefault(t, step, body, PAPER_KEY_OPTIONS, 'yes', copy.askKey());
      if (!r) return step;
      const next = { ...request, teacherVersion: r.id === 'yes' };
      step.events.push({ name: EVENT.paper_key_captured, properties: { teacherVersion: next.teacherVersion } });
      if (t.schoolName === null) {
        step.updates.paperRequest = next;
        step.updates.state = 'PAPER_SCHOOL';
        step.actions.push(text(copy.askSchool()));
        return step;
      }
      return startGeneration(step, next);
    }

    case 'PAPER_SCHOOL': {
      if (lower !== 'skip' && body.length > 0) {
        step.updates.schoolName = body.slice(0, 80);
        step.events.push({ name: EVENT.paper_school_captured, properties: { skipped: false } });
      } else {
        step.events.push({ name: EVENT.paper_school_captured, properties: { skipped: true } });
      }
      step.updates.state = 'PAPER_LOGO';
      step.actions.push(text(copy.askLogo()));
      return step;
    }

    case 'PAPER_LOGO': {
      const items = message.media ?? [];
      const img = items.find((m) => ['image/jpeg', 'image/png'].includes(m.contentType.split(';')[0].trim().toLowerCase()));
      if (items.length > 0 && !img) {
        step.events.push({ name: EVENT.paper_media_rejected, properties: { where: 'logo', contentType: items[0].contentType } });
        step.actions.push(text(copy.mediaRejected()));
        return step;
      }
      if (img) {
        step.actions.push({ type: 'store_logo', media: { url: img.url, contentType: img.contentType } });
        step.events.push({ name: EVENT.paper_logo_captured, properties: { stored: true } });
      } else {
        step.events.push({ name: EVENT.paper_logo_captured, properties: { stored: false } });
      }
      return startGeneration(step, request);
    }

    case 'PAPER_GENERATING': {
      const stale = t.lastInboundAt !== null && now.getTime() - t.lastInboundAt.getTime() > PAPER_STALE_MS;
      if (stale) {
        Object.assign(step.updates, { state: 'IDLE', paperRequest: null, retries: 0 } satisfies TeacherUpdate);
        step.events.push({ name: EVENT.paper_generation_failed, properties: { reason: 'stale' } });
        step.actions.push(text(copy.paperFailed()));
        return step;
      }
      step.events.push({ name: EVENT.still_working_sent, properties: { where: 'paper' } });
      step.actions.push(text(copy.paperStillWorking()));
      // Keep the generation clock anchored to the message that started this paper — same fix as
      // the core GENERATING case in machine.ts, ported here: refreshing lastInboundAt on every
      // "still working" ping would make the stale check above unreachable for an impatient
      // teacher. This matters even more for papers than worksheets — a paper takes 2-4 minutes
      // (vs. a worksheet's ~10s), so a teacher pinging mid-wait is far more likely, not less.
      // Understating lastInboundAt is safe for the Twilio 24h window — it only ever errs conservative.
      delete step.updates.lastInboundAt;
      return step;
    }

    case 'PAPER_PREVIEW': {
      const redosLeft = Math.max(0, MAX_PAPER_REDOS - t.paperRedoCount);
      const choice = parseOption(body, PREVIEW_OPTIONS);
      if (choice?.id === 'file') {
        step.updates.retries = 0;
        step.actions.push(text(copy.preparingFile()), { type: 'render_paper' });
        return step;
      }
      if (choice) { // redo | harder | easier
        if (redosLeft <= 0) {
          step.actions.push(text(copy.previewMenu(0)));
          return step;
        }
        const adjustment = choice.id === 'harder' ? 'harder' as const : choice.id === 'easier' ? 'easier' as const : null;
        step.updates.paperRedoCount = t.paperRedoCount + 1;
        step.events.push({ name: EVENT.paper_redo_requested, properties: { scope: choice.id } });
        return startGeneration(step, { ...request, adjustment });
      }
      const retries = t.retries + 1;
      if (retries <= MAX_MENU_RETRIES) {
        step.updates.retries = retries;
        step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, body: body.slice(0, 80) } });
        step.actions.push(text(copy.previewMenu(redosLeft)));
        return step;
      }
      step.updates.retries = 0; // give up nudging — send the file
      step.actions.push(text(copy.preparingFile()), { type: 'render_paper' });
      return step;
    }

    case 'PAPER_IMPACT': {
      const opt = parseOption(body, PAPER_IMPACT_OPTIONS);
      if (!opt) {
        const retries = t.retries + 1;
        if (retries <= MAX_MENU_RETRIES) {
          step.updates.retries = retries;
          step.events.push({ name: EVENT.unrecognized_input, properties: { state: t.state, body: body.slice(0, 80) } });
          step.actions.push(text(copy.paperImpactQuestion()));
          return step;
        }
      }
      // M1: paperJson/paperRequest are read on EVERY inbound message (TEACHER_COLUMNS) but are
      // dead weight once the wizard is truly done -- clear them on this terminal transition.
      // afterPaperRenderFailure deliberately does NOT do this (she may still need them to retry).
      Object.assign(step.updates, { state: 'IDLE', retries: 0, paperJson: null, paperRequest: null } satisfies TeacherUpdate);
      step.events.push({ name: EVENT.paper_minutes_saved, properties: { minutes: opt ? Number(opt.id) : null } });
      step.actions.push(text(copy.paperShareCta(ctx.joinLink)));
      return step;
    }
  }
}

export function afterPaperGeneration(t: Teacher, outcome: PaperGenerationOutcome, _now: Date): Step {
  const step: Step = { updates: {}, events: [], actions: [] };
  if (!outcome.ok) {
    if (outcome.reason === 'no_readable_media') {
      Object.assign(step.updates, {
        state: 'PAPER_MEDIA', retries: 0,
        paperRequest: t.paperRequest ? { ...t.paperRequest, media: [] } : null,
      } satisfies TeacherUpdate);
      step.events.push({ name: EVENT.paper_generation_failed, properties: { reason: outcome.reason } });
      step.actions.push(text(copy.mediaUnreadable()));
      return step;
    }
    if (t.paperJson !== null) {
      // I1: this was a REDO -- she already has a perfectly good paper from before the attempt.
      // Sending her to IDLE would make it unreachable (typing PAPER resets paperJson via
      // startPaperWizard), losing TWO paid generations instead of one. Route back to
      // PAPER_PREVIEW with the existing paper intact, mirroring afterPaperRenderFailure's shape.
      // The redo cap is untouched by this: paperRedoCount is already incremented the moment she
      // CHOSE the redo (the PAPER_PREVIEW case above), before the outcome is known, so looping a
      // FAILING redo still exhausts MAX_PAPER_REDOS exactly like a succeeding one would.
      const redosLeft = Math.max(0, MAX_PAPER_REDOS - t.paperRedoCount);
      Object.assign(step.updates, { state: 'PAPER_PREVIEW', retries: 0 } satisfies TeacherUpdate);
      step.events.push({ name: EVENT.paper_generation_failed, properties: { reason: outcome.reason } });
      step.actions.push(text(copy.paperRedoFailed()), text(copy.previewMenu(redosLeft)));
      return step;
    }
    Object.assign(step.updates, { state: 'IDLE', retries: 0 } satisfies TeacherUpdate);
    step.events.push({ name: EVENT.paper_generation_failed, properties: { reason: outcome.reason } });
    step.actions.push(text(outcome.reason === 'refusal' ? copy.paperRefused() : copy.paperFailed()));
    return step;
  }
  const redosLeft = Math.max(0, MAX_PAPER_REDOS - t.paperRedoCount);
  Object.assign(step.updates, { state: 'PAPER_PREVIEW', paperJson: outcome.paper, retries: 0 } satisfies TeacherUpdate);
  step.events.push({ name: EVENT.paper_preview_sent, properties: { tiers: outcome.paper.tiers.length, qcPass: outcome.qc.pass } });
  // I3: paperShapeIssues() is a STRUCTURAL sanity check ADVISED to the QC model as repair guidance
  // (see prompts.ts) -- it is never itself an enforcement gate. Once QC has (possibly) repaired
  // the paper, its PRE-repair issues describe a paper we are no longer showing her; re-run the
  // same check against the FINAL paper so only genuinely-residual problems ever surface.
  const residual = outcome.qc.fixedPaper ? paperShapeIssues(outcome.paper) : (outcome.qc.pass ? [] : outcome.qc.issues);
  for (const chunk of chunkText(buildPreviewText(outcome.paper, residual), 1500)) step.actions.push(text(chunk));
  step.actions.push(text(copy.previewMenu(redosLeft)));
  return step;
}

export function afterPaperRender(t: Teacher, docxUrl: string, now: Date): Step {
  const updates: Step['updates'] = { state: 'PAPER_IMPACT', retries: 0 };
  const events: Step['events'] = [{ name: EVENT.paper_exported, properties: { docxUrl } }];
  // Funnel decision: PRD §18.10 treats an exported paper as an activation event exactly like a
  // worksheet -- mirrors afterGeneration's first-success guard (machine.ts) so a paper-only
  // teacher is not undercounted as never-activated in the §14 funnel measurement.
  if (!t.activatedAt) {
    updates.activatedAt = now;
    events.push({ name: EVENT.activated, properties: { via: 'paper' } });
  }
  return {
    updates,
    events,
    actions: [
      text(copy.paperDeliveredIntro(t.paperJson?.title ?? 'your paper')), // WhatsApp cannot set a document filename — name it here
      { type: 'send_document', url: docxUrl },
      text(copy.paperImpactQuestion()),
    ],
  };
}

/**
 * A render/upload failure (Storage down, docx build error, etc.) is NOT a generation failure --
 * she already HAS a fully generated paper (paperJson is left untouched by this step). Sending her
 * to IDLE would make that paper unreachable: typing PAPER resets paperJson via startPaperWizard's
 * fresh request, discarding the 2-4 minutes and the paid model call she already spent (QA-6 F1).
 * So this routes back to PAPER_PREVIEW instead -- the SAME menu she saw right after generation,
 * which already offers "1) Get the Word file" as a retryable option. No new state, no new copy:
 * this reuses the existing preview menu, which already IS the "try that again" path.
 */
export function afterPaperRenderFailure(t: Teacher, _now: Date): Step {
  const redosLeft = Math.max(0, MAX_PAPER_REDOS - t.paperRedoCount);
  return {
    updates: { state: 'PAPER_PREVIEW', retries: 0 }, // paperJson/paperRequest/paperRedoCount untouched — she keeps the paper she already has
    events: [],
    actions: [text(msg.somethingWentWrong()), text(copy.previewMenu(redosLeft))],
  };
}

export function buildPreviewText(paper: PaperJson, qcIssues: string[]): string {
  const lines = [`📋 *${paper.title}*`, `${paper.subjectLabel} · ${paper.gradeLabel} · ${paper.chapterLabel}`, ''];
  for (const tier of paper.tiers) {
    lines.push(`*TIER ${tier.tier} — ${tier.tierLabel}* · ${tier.timeMinutes} min · ${tier.totalMarks} marks`);
    for (const task of tier.tasks) {
      const marks = task.questions.reduce((s, q) => s + q.marks, 0);
      lines.push(`  ${task.heading} (${task.headingEnglish}) — ${task.questions.length} Q · ${marks} marks`);
    }
    const first = tier.tasks[0]?.questions[0];
    if (first) lines.push(`  e.g. ${first.text.slice(0, 140)}`);
    lines.push('');
  }
  for (const n of paper.sourceNotes) lines.push(`⚠️ ${n}`);
  for (const issue of qcIssues.filter((i) => i !== 'qc_unavailable')) lines.push(`⚠️ ${issue}`);
  return lines.join('\n').trim();
}

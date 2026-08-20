import type { Action, GenerationOutcome, SkillId, Step, Teacher } from '../domain/types.js';
import { GenerationRefusedError } from '../domain/types.js';
import { EVENT } from '../domain/events.js';
import type { Clock, EventLog, GenerationStore, Generator, Messenger, PdfBuilder, PdfStore, TeacherRepo } from '../ports.js';
import { afterGeneration, profileOf } from './machine.js';
import { splitIntoSections } from './postprocess.js';
import { SKILLS } from './skills.js';
import * as msg from './messages.js';

export interface ExecutorDeps {
  teachers: TeacherRepo;
  events: EventLog;
  generations: GenerationStore;
  messenger: Messenger;
  generator: Generator;
  pdfBuilder: PdfBuilder;
  pdfStore: PdfStore;
  clock: Clock;
  joinLink: string;
  timezone: string;
}

export class Executor {
  constructor(private readonly deps: ExecutorDeps) {}

  async runStep(teacher: Teacher, step: Step): Promise<Teacher> {
    const d = this.deps;
    const now = d.clock.now();
    let current = Object.keys(step.updates).length > 0 ? await d.teachers.update(teacher.id, step.updates) : teacher;
    for (const e of step.events) await d.events.log(current.id, e, now);
    for (const action of step.actions) {
      current = await this.runAction(current, action);
    }
    return current;
  }

  private async runAction(teacher: Teacher, action: Action): Promise<Teacher> {
    const d = this.deps;
    if (action.type === 'send_text' || action.type === 'send_document') {
      try {
        const res =
          action.type === 'send_text'
            ? await d.messenger.sendText(teacher.waFrom, action.body)
            : await d.messenger.sendDocument(teacher.waFrom, action.url);
        if (!res.ok) {
          await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { action: action.type, errorCode: res.errorCode } }, d.clock.now());
        }
      } catch (err) {
        // A thrown send (e.g. TwilioMessenger's >1500-char guard, or a rethrown non-RestException
        // error such as ECONNRESET) must not abort the rest of the step -- earlier updates may
        // have already advanced the teacher's state, so later actions (remaining chunks, the pdf,
        // the impact prompt) still need to run. Treat it exactly like a failed SendResult.
        console.error('[executor] send failed', err);
        await d.events.log(
          teacher.id,
          { name: EVENT.error_occurred, properties: { action: action.type, errorCode: null, message: err instanceof Error ? err.message : String(err) } },
          d.clock.now(),
        );
      }
      return teacher;
    }
    if (action.type === 'generate') return this.runGeneration(teacher, action.skillId, action.topic);
    return teacher; // store_logo / generate_paper / render_paper wired in Task 26
  }

  private async runGeneration(teacher: Teacher, skillId: SkillId, topic: string): Promise<Teacher> {
    const d = this.deps;
    const profile = profileOf(teacher) ?? { grade: teacher.grade ?? 'Other', subject: teacher.subject ?? 'Other', board: teacher.board ?? 'Other' };
    await d.events.log(teacher.id, { name: EVENT.generation_started, skillId, properties: { topic } }, d.clock.now());

    let outcome: GenerationOutcome;
    try {
      const result = await d.generator.generate({ skillId, topic, ...profile });
      let pdfUrl: string | null = null;
      try {
        const parsed = splitIntoSections(result.text, SKILLS[skillId].sectionHeaders);
        const pdf = await d.pdfBuilder.build({
          title: parsed.title ?? `${SKILLS[skillId].title}: ${topic}`,
          subtitle: `${profile.grade} · ${profile.subject} · ${profile.board} · ${topic}`,
          sections: parsed.sections,
          footer: `${msg.disclaimer().replace('⚠️ ', '')} Made with ${msg.BOT_NAME}.`,
        });
        pdfUrl = await d.pdfStore.storeWorksheetPdf(teacher.id, pdf);
      } catch (pdfErr) {
        console.error('[executor] pdf failed', pdfErr);
        pdfUrl = null;
      }
      try {
        await d.generations.save({ teacherId: teacher.id, skillId, topic, result, pdfUrl, at: d.clock.now() });
        await d.events.log(
          teacher.id,
          { name: EVENT.generation_succeeded, skillId, properties: { latencyMs: result.latencyMs, outputTokens: result.outputTokens, model: result.model } },
          d.clock.now(),
        );
      } catch (saveErr) {
        // A successful, billed model call must never be demoted to a failure by a persistence or
        // telemetry blip: the teacher still gets her worksheet either way.
        console.error('[executor] generation save/log failed', saveErr);
      }
      outcome = { ok: true, result, pdfUrl };
    } catch (err) {
      const refused = err instanceof GenerationRefusedError;
      if (!refused) {
        console.error('[executor] generation failed', err);
        await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'generate', message: err instanceof Error ? err.message : String(err) } }, d.clock.now());
      }
      outcome = { ok: false, reason: refused ? 'refusal' : 'error' };
    }
    const followUp = afterGeneration(teacher, outcome, d.clock.now());
    return this.runStep(teacher, followUp);
  }
}

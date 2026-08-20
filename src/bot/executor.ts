import type { Action, GenerationOutcome, SkillId, Step, Teacher } from '../domain/types.js';
import { GenerationRefusedError, type InboundMedia, type PaperGenerationOutcome } from '../domain/types.js';
import { EVENT } from '../domain/events.js';
import type {
  Clock, DocBuilder, EventLog, FetchedMedia, GenerationStore, Generator, MediaFetcher, Messenger,
  PaperGenInput, PaperGenerator, PapersRepo, PaperStore, PdfBuilder, PdfStore, TeacherRepo,
} from '../ports.js';
import { afterGeneration, profileOf } from './machine.js';
import { afterPaperGeneration, afterPaperRender } from './paper/wizard.js';
import { splitIntoSections } from './postprocess.js';
import { SKILLS } from './skills.js';
import * as msg from './messages.js';
import * as paperCopy from './paper/copy.js';

export interface ExecutorDeps {
  teachers: TeacherRepo;
  events: EventLog;
  generations: GenerationStore;
  messenger: Messenger;
  generator: Generator;
  pdfBuilder: PdfBuilder;
  pdfStore: PdfStore;
  mediaFetcher: MediaFetcher;
  paperGenerator: PaperGenerator;
  docBuilder: DocBuilder;
  paperStore: PaperStore;
  papers: PapersRepo;
  clock: Clock;
  joinLink: string;
  timezone: string;
}

/** Raw-byte budget across all fetched lesson media — keeps the Anthropic request under 32 MB after ~33% base64 inflation. */
export const MAX_TOTAL_MEDIA_BYTES = 20 * 1024 * 1024;

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
    if (action.type === 'store_logo') return this.runStoreLogo(teacher, action.media);
    if (action.type === 'generate_paper') return this.runPaperGeneration(teacher);
    return this.runPaperRender(teacher); // action.type === 'render_paper'
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

  private async runStoreLogo(teacher: Teacher, media: InboundMedia): Promise<Teacher> {
    const d = this.deps;
    try {
      const fetched = await d.mediaFetcher.fetch(media);
      if (fetched.contentType !== 'image/jpeg' && fetched.contentType !== 'image/png') {
        throw new Error(`logo must be jpeg/png, got ${fetched.contentType}`);
      }
      const url = await d.paperStore.storeLogo(teacher.id, fetched.data, fetched.contentType);
      return await d.teachers.update(teacher.id, { schoolLogoUrl: url });
    } catch (err) {
      console.error('[executor] logo store failed', err);
      await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'logo', message: err instanceof Error ? err.message : String(err) } }, d.clock.now());
      return teacher; // non-fatal — the paper renders with the school name only
    }
  }

  private async runPaperGeneration(teacher: Teacher): Promise<Teacher> {
    const d = this.deps;
    const request = teacher.paperRequest;
    if (!request) {
      await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'generate_paper', message: 'no paperRequest' } }, d.clock.now());
      await d.messenger.sendText(teacher.waFrom, msg.somethingWentWrong());
      return d.teachers.update(teacher.id, { state: 'IDLE' });
    }
    await d.events.log(teacher.id, { name: EVENT.paper_generation_started, properties: { chapter: request.chapter, mediaCount: request.media.length } }, d.clock.now());

    // Fetch the lesson media: individual failures are skipped (logged), and a raw-byte budget
    // keeps the eventual API request under the 32 MB cap.
    const media: FetchedMedia[] = [];
    let bytes = 0;
    for (const m of request.media) {
      try {
        const fetched = await d.mediaFetcher.fetch(m);
        if (bytes + fetched.data.length > MAX_TOTAL_MEDIA_BYTES) {
          await d.events.log(teacher.id, { name: EVENT.paper_media_rejected, properties: { reason: 'budget', url: m.url } }, d.clock.now());
          continue;
        }
        bytes += fetched.data.length;
        media.push(fetched);
      } catch (err) {
        console.error('[executor] media fetch failed', err);
        await d.events.log(teacher.id, { name: EVENT.paper_media_rejected, properties: { reason: 'fetch_failed', url: m.url } }, d.clock.now());
      }
    }

    let outcome: PaperGenerationOutcome;
    if (request.media.length > 0 && media.length === 0) {
      outcome = { ok: false, reason: 'no_readable_media' }; // afterPaperGeneration logs paper_generation_failed
    } else {
      const profile = profileOf(teacher) ?? { grade: teacher.grade ?? 'Other', subject: teacher.subject ?? 'Other', board: teacher.board ?? 'Other' };
      const input: PaperGenInput = { request, profile, media };
      try {
        const result = await d.paperGenerator.generatePaper(input);
        const qc = await d.paperGenerator.qcPaper(result.paper, input);
        const paper = qc.fixedPaper ?? result.paper; // the one bounded auto-repair round (PRD §18.7)
        await d.events.log(teacher.id, {
          name: EVENT.paper_generated,
          properties: {
            model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs,
            tiers: paper.tiers.length, totalMarks: paper.tiers.reduce((s, t) => s + t.totalMarks, 0),
          },
        }, d.clock.now());
        await d.events.log(teacher.id, { name: EVENT.paper_qc_completed, properties: { pass: qc.pass, issues: qc.issues.length, repaired: qc.fixedPaper !== null } }, d.clock.now());
        outcome = { ok: true, paper, qc };
      } catch (err) {
        const refused = err instanceof GenerationRefusedError;
        if (!refused) {
          console.error('[executor] paper generation failed', err);
          await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'generate_paper', message: err instanceof Error ? err.message : String(err) } }, d.clock.now());
        }
        outcome = { ok: false, reason: refused ? 'refusal' : 'error' };
      }
    }
    return this.runStep(teacher, afterPaperGeneration(teacher, outcome, d.clock.now()));
  }

  private async runPaperRender(teacher: Teacher): Promise<Teacher> {
    const d = this.deps;
    const paper = teacher.paperJson;
    const request = teacher.paperRequest;
    if (!paper || !request) {
      await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'render_paper', message: 'no paperJson/paperRequest' } }, d.clock.now());
      await d.messenger.sendText(teacher.waFrom, msg.somethingWentWrong());
      return d.teachers.update(teacher.id, { state: 'IDLE' });
    }
    try {
      let logo: FetchedMedia | null = null;
      if (teacher.schoolLogoUrl) {
        try {
          const ct = teacher.schoolLogoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'; // extension was set by storeLogo
          logo = await d.mediaFetcher.fetch({ url: teacher.schoolLogoUrl, contentType: ct });
        } catch (err) {
          console.error('[executor] logo fetch failed — rendering without it', err);
        }
      }
      const docx = await d.docBuilder.buildPaperDocx(paper, { schoolName: teacher.schoolName, logo }, request.teacherVersion);
      const docxUrl = await d.paperStore.storePaperDocx(teacher.id, docx);
      try {
        // OWN try/catch, mirroring runGeneration's generations.save isolation (Task 13 fix): the
        // docx is already built AND uploaded at this point (docxUrl is a live, public URL) -- a
        // papers-table blip must not discard a paper the teacher already paid for and waited
        // minutes for. Console-only on failure; delivery still proceeds below.
        await d.papers.save({
          teacherId: teacher.id, request, docxUrl,
          totalMarks: paper.tiers.reduce((s, t) => s + t.totalMarks, 0),
          redoCount: teacher.paperRedoCount, pageCount: request.media.length, at: d.clock.now(),
        });
      } catch (saveErr) {
        console.error('[executor] papers.save failed', saveErr);
      }
      return this.runStep(teacher, afterPaperRender(teacher, docxUrl, d.clock.now()));
    } catch (err) {
      console.error('[executor] paper render failed', err);
      await d.events.log(teacher.id, { name: EVENT.error_occurred, properties: { where: 'render_paper', message: err instanceof Error ? err.message : String(err) } }, d.clock.now());
      await d.messenger.sendText(teacher.waFrom, paperCopy.paperFailed());
      return d.teachers.update(teacher.id, { state: 'IDLE' });
    }
  }
}

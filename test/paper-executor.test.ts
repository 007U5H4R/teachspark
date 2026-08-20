import { describe, it, expect } from 'vitest';
import { Executor, type ExecutorDeps } from '../src/bot/executor.js';
import {
  FixedClock, FakeGenerator, FakeMessenger, FakePdfBuilder, FakePdfStore, FakeMediaFetcher,
  FakePaperGenerator, FakeDocBuilder, FakePaperStore, InMemoryPapersRepo,
  InMemoryEventLog, InMemoryGenerationStore, InMemoryTeacherRepo, samplePaperJson,
} from '../src/adapters/memory.js';
import { EVENT } from '../src/domain/events.js';
import type { PaperRequest, Step, Teacher } from '../src/domain/types.js';

const NOW = new Date('2026-08-23T14:00:00+05:30');

function makeDeps(): ExecutorDeps {
  return {
    teachers: new InMemoryTeacherRepo(), events: new InMemoryEventLog(), generations: new InMemoryGenerationStore(),
    messenger: new FakeMessenger(), generator: new FakeGenerator('x'), pdfBuilder: new FakePdfBuilder(), pdfStore: new FakePdfStore(),
    mediaFetcher: new FakeMediaFetcher(), paperGenerator: new FakePaperGenerator(), docBuilder: new FakeDocBuilder(),
    paperStore: new FakePaperStore(), papers: new InMemoryPapersRepo(),
    clock: new FixedClock(NOW), joinLink: 'https://wa.me/1?text=join%20x', timezone: 'Asia/Kolkata',
  };
}
const request: PaperRequest = {
  subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'टोपी शुक्ला',
  assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true,
  media: [{ url: 'https://api.twilio.com/m/ME1', contentType: 'image/jpeg' }], adjustment: null,
};
async function makeTeacher(deps: ExecutorDeps, over: Partial<Teacher> = {}): Promise<Teacher> {
  const t = await deps.teachers.create({ waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera', now: NOW });
  return deps.teachers.update(t.id, { grade: 'g', subject: 'Hindi', board: 'b', state: 'PAPER_GENERATING', paperRequest: request, ...over });
}
const gen: Step = { updates: {}, events: [], actions: [{ type: 'generate_paper' }] };

describe('generate_paper pipeline', () => {
  it('fetches media, generates, QCs, previews', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps);
    const updated = await new Executor(deps).runStep(t, gen);
    expect((deps.mediaFetcher as FakeMediaFetcher).fetched).toHaveLength(1);
    expect((deps.paperGenerator as FakePaperGenerator).calls).toHaveLength(1);
    expect((deps.paperGenerator as FakePaperGenerator).qcCalls).toBe(1);
    const names = (deps.events as InMemoryEventLog).names();
    for (const n of [EVENT.paper_generation_started, EVENT.paper_generated, EVENT.paper_qc_completed, EVENT.paper_preview_sent]) expect(names).toContain(n);
    expect(updated.state).toBe('PAPER_PREVIEW');
    expect(updated.paperJson).not.toBeNull();
    const sent = (deps.messenger as FakeMessenger).texts();
    expect(sent.join('\n')).toContain('टोपी शुक्ला');
    expect(sent.at(-1)).toContain('1)');
  });
  it('uses the QC-repaired paper when QC fixes it', async () => {
    const deps = makeDeps();
    const fixed = samplePaperJson({ title: 'सुधारा हुआ' });
    (deps.paperGenerator as FakePaperGenerator).qcReport = { pass: false, issues: ['fixed marks'], fixedPaper: fixed };
    const t = await makeTeacher(deps);
    const updated = await new Executor(deps).runStep(t, gen);
    expect((updated.paperJson as { title: string }).title).toBe('सुधारा हुआ');
  });
  it('all media failing to download → no_readable_media path back to PAPER_MEDIA', async () => {
    const deps = makeDeps();
    (deps.mediaFetcher as FakeMediaFetcher).failWith = new Error('twilio 404');
    const t = await makeTeacher(deps);
    const updated = await new Executor(deps).runStep(t, gen);
    expect(updated.state).toBe('PAPER_MEDIA');
    expect((updated.paperRequest as PaperRequest).media).toHaveLength(0);
  });
  it('generator failure → apology, paper_generation_failed, IDLE', async () => {
    const deps = makeDeps();
    (deps.paperGenerator as FakePaperGenerator).failWith = new Error('api down');
    const t = await makeTeacher(deps);
    const updated = await new Executor(deps).runStep(t, gen);
    expect(updated.state).toBe('IDLE');
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.paper_generation_failed);
  });
});

describe('render_paper pipeline', () => {
  it('renders, stores, saves the papers row, sends text→document→impact', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson(), schoolName: 'Ryan', paperRedoCount: 1 });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    expect((deps.docBuilder as FakeDocBuilder).builds[0]).toMatchObject({ teacherVersion: true, branding: { schoolName: 'Ryan' } });
    const saved = (deps.papers as InMemoryPapersRepo).saved[0];
    expect(saved).toMatchObject({ redoCount: 1, pageCount: 1, totalMarks: 20 });
    expect(saved.docxUrl).toMatch(/\.docx$/);
    const kinds = (deps.messenger as FakeMessenger).sent.map((s) => s.kind);
    expect(kinds).toEqual(['text', 'document', 'text']); // intro → file → impact question
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.paper_exported);
    expect(updated.state).toBe('PAPER_IMPACT');
  });
  it('includes the stored logo in branding when set', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson(), schoolLogoUrl: 'https://sb.test/logo.png' });
    await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    expect((deps.docBuilder as FakeDocBuilder).builds[0].branding.logo).not.toBeNull();
  });
  it('a papers.save failure does not discard an already-rendered, already-uploaded paper', async () => {
    const deps = makeDeps();
    (deps.papers as InMemoryPapersRepo).failWith = new Error('papers table down');
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson() });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    // NOT demoted: still delivered and landed in PAPER_IMPACT, not bounced back to IDLE
    expect(updated.state).toBe('PAPER_IMPACT');
    const kinds = (deps.messenger as FakeMessenger).sent.map((s) => s.kind);
    expect(kinds).toEqual(['text', 'document', 'text']); // the docx still went out
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.paper_exported);
    expect((deps.papers as InMemoryPapersRepo).saved).toHaveLength(0); // the row itself is the documented gap
  });

  it('an events.log hiccup ONLY on paper_exported does not cancel delivery of an already-rendered paper', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson() });
    const realLog = (deps.events as InMemoryEventLog).log.bind(deps.events);
    (deps.events as InMemoryEventLog).log = async (teacherId, event, at) => {
      if (event.name === EVENT.paper_exported) throw new Error('events table down');
      return realLog(teacherId, event, at);
    };
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    const kinds = (deps.messenger as FakeMessenger).sent.map((s) => s.kind);
    expect(kinds).toEqual(['text', 'document', 'text']); // the docx still went out despite the log failure
    expect(updated.state).toBe('PAPER_IMPACT'); // the state update itself succeeded in this sub-case
  });

  it('a teachers.update hiccup on the delivery transition does not cancel delivery either', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson() });
    deps.teachers.update = async () => { throw new Error('db down'); };
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    const kinds = (deps.messenger as FakeMessenger).sent.map((s) => s.kind);
    expect(kinds).toEqual(['text', 'document', 'text']); // the docx still went out despite the update failure
    expect(updated.state).not.toBe('IDLE'); // not stranded with an apology
  });

  it('a docx upload failure leaves her in PAPER_PREVIEW with the paper intact, retryable once the store recovers', async () => {
    const deps = makeDeps();
    (deps.paperStore as FakePaperStore).failWith = new Error('supabase storage 503');
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson() });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });

    expect(updated.state).toBe('PAPER_PREVIEW'); // not stranded in IDLE (QA-6 F1)
    expect(updated.paperJson).not.toBeNull(); // the paper she already generated is preserved
    expect(updated.paperRedoCount).toBe(0); // the retry loop does not consume redo budget
    expect((deps.events as InMemoryEventLog).names()).toContain(EVENT.error_occurred);
    expect((deps.messenger as FakeMessenger).texts().length).toBeGreaterThan(0); // an intelligible retry message
    expect((deps.messenger as FakeMessenger).sent.some((s) => s.kind === 'document')).toBe(false);

    // she recovers: the store comes back, and a subsequent "get the file" attempt succeeds
    (deps.paperStore as FakePaperStore).failWith = null;
    const retried = await new Executor(deps).runStep(updated, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });
    expect(retried.state).toBe('PAPER_IMPACT');
    expect(retried.paperRedoCount).toBe(0);
    expect((deps.messenger as FakeMessenger).sent.filter((s) => s.kind === 'document')).toHaveLength(1);
    expect((deps.papers as InMemoryPapersRepo).saved).toHaveLength(1);
  });

  it('a docx BUILD failure (not just upload) also degrades to a retryable PAPER_PREVIEW, not IDLE', async () => {
    const deps = makeDeps();
    (deps.docBuilder as FakeDocBuilder).failWith = new Error('docx template render error');
    const t = await makeTeacher(deps, { state: 'PAPER_PREVIEW', paperJson: samplePaperJson() });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'render_paper' }] });

    expect(updated.state).toBe('PAPER_PREVIEW');
    expect(updated.paperJson).not.toBeNull();
    expect((deps.paperStore as FakePaperStore).storedDocs).toHaveLength(0); // never reached upload
    expect((deps.messenger as FakeMessenger).sent.some((s) => s.kind === 'document')).toBe(false);
  });
});

describe('store_logo action', () => {
  it('stores the logo and updates the teacher', async () => {
    const deps = makeDeps();
    const t = await makeTeacher(deps, { state: 'PAPER_LOGO' });
    const updated = await new Executor(deps).runStep(t, { updates: {}, events: [], actions: [{ type: 'store_logo', media: { url: 'https://api.twilio.com/m/L1', contentType: 'image/jpeg' } }] });
    expect((deps.paperStore as FakePaperStore).storedLogos).toHaveLength(1);
    expect(updated.schoolLogoUrl).toMatch(/^https:/);
  });
});

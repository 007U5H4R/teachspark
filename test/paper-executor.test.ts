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

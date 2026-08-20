import { describe, it, expect } from 'vitest';
import {
  FakeMediaFetcher, FakePaperGenerator, FakeDocBuilder, FakePaperStore, InMemoryPapersRepo,
  InMemoryTeacherRepo, samplePaperJson,
} from '../src/adapters/memory.js';
import { isPaperState } from '../src/domain/types.js';
import { EVENT } from '../src/domain/events.js';

describe('paper domain glue', () => {
  it('isPaperState distinguishes wizard states', () => {
    expect(isPaperState('PAPER_CHAPTER')).toBe(true);
    expect(isPaperState('AWAITING_TOPIC')).toBe(false);
    expect(isPaperState('IDLE')).toBe(false);
  });
  it('paper event names exist verbatim', () => {
    for (const n of ['paper_started', 'paper_media_received', 'paper_generated', 'paper_exported', 'paper_minutes_saved']) {
      expect(EVENT[n as keyof typeof EVENT]).toBe(n);
    }
  });
  it('new teachers start with empty paper fields', async () => {
    const t = await new InMemoryTeacherRepo().create({ waFrom: 'whatsapp:+911', waId: null, profileName: null, now: new Date() });
    expect(t.schoolName).toBeNull();
    expect(t.schoolLogoUrl).toBeNull();
    expect(t.paperRequest).toBeNull();
    expect(t.paperJson).toBeNull();
    expect(t.paperRedoCount).toBe(0);
  });
});

describe('paper fakes', () => {
  it('FakeMediaFetcher returns bytes and records calls', async () => {
    const f = new FakeMediaFetcher();
    const m = await f.fetch({ url: 'https://api.twilio.com/m/1', contentType: 'image/jpeg' });
    expect(m.data.length).toBeGreaterThan(0);
    expect(m.contentType).toBe('image/jpeg');
    expect(f.fetched).toHaveLength(1);
    f.failWith = new Error('gone');
    await expect(f.fetch({ url: 'x', contentType: 'image/jpeg' })).rejects.toThrow('gone');
  });
  it('FakePaperGenerator returns a structurally complete paper and a QC pass', async () => {
    const g = new FakePaperGenerator();
    const input = { request: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'c', assessmentType: 'worksheet' as const, tiers: ['A' as const], teacherVersion: true, media: [], adjustment: null }, profile: { grade: 'g', subject: 'Hindi', board: 'b' }, media: [] };
    const r = await g.generatePaper(input);
    expect(r.paper.tiers[0].tasks).toHaveLength(4);
    expect(r.paper.tiers[0].tasks[0].questions[0].type).toBe('MCQ');
    expect((await g.qcPaper(r.paper, input)).pass).toBe(true);
    expect(g.calls).toHaveLength(1);
    expect(g.qcCalls).toBe(1);
  });
  it('FakeDocBuilder / FakePaperStore / InMemoryPapersRepo round-trip', async () => {
    const docx = await new FakeDocBuilder().buildPaperDocx(samplePaperJson(), { schoolName: 'Ryan', logo: null }, true);
    const store = new FakePaperStore();
    expect(await store.storePaperDocx('t1', docx)).toMatch(/\/t1\/.+\.docx$/);
    expect(await store.storeLogo('t1', Buffer.from('img'), 'image/png')).toMatch(/^https:/);
    const repo = new InMemoryPapersRepo();
    await repo.save({ teacherId: 't1', request: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'c', assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true, media: [], adjustment: null }, docxUrl: 'https://x/y.docx', totalMarks: 20, redoCount: 0, pageCount: 0, at: new Date() });
    expect(repo.saved).toHaveLength(1);
  });
});

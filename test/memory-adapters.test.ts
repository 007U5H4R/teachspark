import { describe, it, expect } from 'vitest';
import {
  InMemoryTeacherRepo,
  InMemoryEventLog,
  InMemoryGenerationStore,
  FakeMessenger,
  FakeGenerator,
  FakePdfBuilder,
  FakePdfStore,
  FixedClock,
} from '../src/adapters/memory.js';

describe('InMemoryTeacherRepo', () => {
  it('creates, finds, updates and lists', async () => {
    const repo = new InMemoryTeacherRepo();
    const now = new Date('2026-08-23T10:00:00Z');
    const t = await repo.create({ waFrom: 'whatsapp:+911', waId: '911', profileName: 'Meera', now });
    expect(t.state).toBe('NEW');
    expect(t.skillsCompleted).toEqual([]);
    expect(t.retries).toBe(0);
    expect(t.nudgeCount).toBe(0);
    expect(t.createdAt).toEqual(now);
    expect(await repo.findByWaFrom('whatsapp:+911')).toEqual(t);
    expect(await repo.findByWaFrom('whatsapp:+999')).toBeNull();
    const u = await repo.update(t.id, { state: 'AWAITING_GRADE', grade: 'Middle (Classes 6-8)' });
    expect(u.state).toBe('AWAITING_GRADE');
    expect(u.grade).toBe('Middle (Classes 6-8)');
    expect((await repo.listAll()).length).toBe(1);
  });
  it('findNudgeDue returns only due, unsent nudges', async () => {
    const repo = new InMemoryTeacherRepo();
    const now = new Date('2026-08-24T06:00:00Z');
    const a = await repo.create({ waFrom: 'a', waId: null, profileName: null, now });
    const b = await repo.create({ waFrom: 'b', waId: null, profileName: null, now });
    const c = await repo.create({ waFrom: 'c', waId: null, profileName: null, now });
    await repo.update(a.id, { nudgeDueAt: new Date('2026-08-24T05:00:00Z'), nudgeSentAt: null });
    await repo.update(b.id, { nudgeDueAt: new Date('2026-08-24T07:00:00Z'), nudgeSentAt: null });
    await repo.update(c.id, { nudgeDueAt: new Date('2026-08-24T05:00:00Z'), nudgeSentAt: now });
    const due = await repo.findNudgeDue(now);
    expect(due.map((t) => t.waFrom)).toEqual(['a']);
  });
});

describe('InMemoryEventLog / GenerationStore', () => {
  it('records events with timestamps', async () => {
    const log = new InMemoryEventLog();
    const at = new Date('2026-08-23T10:00:00Z');
    await log.log('t1', { name: 'message_received', properties: { state: 'NEW' } }, at);
    const rows = await log.listAll();
    expect(rows).toEqual([{ teacherId: 't1', name: 'message_received', skillId: null, properties: { state: 'NEW' }, createdAt: at }]);
  });
  it('stores generations', async () => {
    const store = new InMemoryGenerationStore();
    await store.save({
      teacherId: 't1', skillId: 'worksheet', topic: 'Fractions', pdfUrl: null, at: new Date(),
      result: { text: 'x', model: 'fake', inputTokens: 1, outputTokens: 2, latencyMs: 3, requestId: null, promptUsed: 'p' },
    });
    expect(store.saved.length).toBe(1);
  });
});

describe('Fakes', () => {
  it('FakeMessenger records sends and can fail with a code', async () => {
    const m = new FakeMessenger();
    expect(await m.sendText('x', 'hi')).toEqual({ ok: true, sid: 'SM1', errorCode: null });
    expect(await m.sendDocument('x', 'https://e.test/a.pdf')).toEqual({ ok: true, sid: 'SM2', errorCode: null });
    expect(m.sent).toEqual([
      { to: 'x', kind: 'text', body: 'hi', url: null },
      { to: 'x', kind: 'document', body: null, url: 'https://e.test/a.pdf' },
    ]);
    m.failWith = 63016;
    expect(await m.sendText('x', 'late')).toEqual({ ok: false, sid: null, errorCode: 63016 });
  });
  it('FakeGenerator returns canned text and can throw', async () => {
    const g = new FakeGenerator('TITLE: T\nLEVEL 1 - SUPPORT\n1. q');
    const r = await g.generate({ skillId: 'worksheet', topic: 'x', grade: 'g', subject: 's', board: 'b' });
    expect(r.text).toContain('LEVEL 1 - SUPPORT');
    expect(g.calls.length).toBe(1);
    g.failWith = new Error('boom');
    await expect(g.generate({ skillId: 'worksheet', topic: 'x', grade: 'g', subject: 's', board: 'b' })).rejects.toThrow('boom');
  });
  it('FakePdfBuilder/FakePdfStore produce a buffer and a .pdf url', async () => {
    const pdf = await new FakePdfBuilder().build({ title: 't', subtitle: 's', sections: [], footer: 'f' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const url = await new FakePdfStore().storeWorksheetPdf('t1', pdf);
    expect(url).toMatch(/^https:\/\/.+\/t1\/.+\.pdf$/);
  });
  it('FixedClock advances', () => {
    const c = new FixedClock(new Date('2026-08-23T10:00:00Z'));
    c.advance(60_000);
    expect(c.now().toISOString()).toBe('2026-08-23T10:01:00.000Z');
  });
});

import { describe, it, expect } from 'vitest';
import { InMemorySignupRepo, InMemoryWebEventLog } from '../src/adapters/memory.js';
import { DuplicateSignupError, WEB_EVENT, PROFESSIONS } from '../src/domain/web.js';

const now = new Date('2026-08-23T10:00:00Z');
const input = { name: 'Meera', profession: 'school_teacher' as const, organization: 'DPS', phoneE164: '+919876543210', phoneRaw: '98765 43210', city: 'Pune', country: 'IN', source: null, now };

describe('InMemorySignupRepo', () => {
  it('creates, finds by id and by phone, and lists', async () => {
    const repo = new InMemorySignupRepo();
    const s = await repo.create(input);
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
    expect(s.joinTappedAt).toBeNull();
    expect(s.teacherId).toBeNull();
    expect(s.createdAt).toEqual(now);
    expect(await repo.findById(s.id)).toEqual(s);
    expect(await repo.findByPhoneE164('+919876543210')).toEqual(s);
    expect(await repo.findByPhoneE164('+910000000000')).toBeNull();
    expect(await repo.listAll()).toHaveLength(1);
  });
  it('rejects a second signup with the same phone with DuplicateSignupError carrying the existing row', async () => {
    const repo = new InMemorySignupRepo();
    const first = await repo.create(input);
    await expect(repo.create({ ...input, name: 'Again' })).rejects.toBeInstanceOf(DuplicateSignupError);
    await repo.create({ ...input, name: 'Again' }).catch((e: DuplicateSignupError) => expect(e.existing.id).toBe(first.id));
  });
  it('markJoinTapped sets the timestamp once and is idempotent', async () => {
    const repo = new InMemorySignupRepo();
    const s = await repo.create(input);
    await repo.markJoinTapped(s.id, now);
    const later = new Date(now.getTime() + 60_000);
    await repo.markJoinTapped(s.id, later);
    expect((await repo.findById(s.id))?.joinTappedAt).toEqual(now);
    await expect(repo.markJoinTapped('missing', now)).rejects.toThrow(/not found/);
  });
});

describe('InMemoryWebEventLog', () => {
  it('logs and lists rows with defaults', async () => {
    const log = new InMemoryWebEventLog();
    await log.log({ visitorId: 'v1', name: WEB_EVENT.landing_view, signupId: null }, now);
    await log.log({ visitorId: null, name: WEB_EVENT.join_tapped, signupId: 's1', properties: { a: 1 } }, now);
    const rows = await log.listAll();
    expect(rows).toEqual([
      { visitorId: 'v1', name: 'landing_view', signupId: null, properties: {}, createdAt: now },
      { visitorId: null, name: 'join_tapped', signupId: 's1', properties: { a: 1 }, createdAt: now },
    ]);
    expect(log.names()).toEqual(['landing_view', 'join_tapped']);
  });
});

describe('constants', () => {
  it('exposes the profession enum used by the form and the API', () => {
    expect(PROFESSIONS).toContain('school_teacher');
    expect(PROFESSIONS).toContain('other');
  });
});

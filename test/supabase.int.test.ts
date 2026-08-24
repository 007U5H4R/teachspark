import { describe, it, expect, beforeAll } from 'vitest';
import { createSupabase, SupabaseTeacherRepo, SupabaseEventLog, SupabaseGenerationStore, SupabasePapersRepo } from '../src/adapters/supabase.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !key)('Supabase adapters (integration)', () => {
  // Client construction happens in beforeAll (not at describe-body top level) so that
  // when the suite is skipped, Vitest never invokes it. describe.skipIf still runs the
  // describe body itself during test collection to discover nested `it`s, so top-level
  // code there executes even for a skipped suite; hooks and tests do not.
  let sb: ReturnType<typeof createSupabase>;
  let repo: SupabaseTeacherRepo;
  let events: SupabaseEventLog;
  let gens: SupabaseGenerationStore;
  const waFrom = `whatsapp:+test${Date.now()}`;

  beforeAll(() => {
    sb = createSupabase(url ?? '', key ?? '');
    repo = new SupabaseTeacherRepo(sb);
    events = new SupabaseEventLog(sb);
    gens = new SupabaseGenerationStore(sb);
  });

  it('round-trips a teacher, an event, a generation and a paper', async () => {
    const now = new Date();
    const t = await repo.create({ waFrom, waId: null, profileName: 'Int Test', now });
    expect(t.state).toBe('NEW');
    const due = new Date(now.getTime() - 60_000);
    const u = await repo.update(t.id, { state: 'IDLE', nudgeDueAt: due, nudgeSentAt: null, skillsCompleted: ['worksheet'] });
    expect(u.state).toBe('IDLE');
    expect(u.skillsCompleted).toEqual(['worksheet']);
    expect((await repo.findNudgeDue(now)).some((x) => x.id === t.id)).toBe(true);
    await events.log(t.id, { name: 'message_received', properties: { state: 'NEW' } }, now);
    expect((await events.listAll()).some((e) => e.teacherId === t.id)).toBe(true);
    await gens.save({ teacherId: t.id, skillId: 'worksheet', topic: 'Fractions', pdfUrl: null, at: now, result: { text: 'x', model: 'm', inputTokens: 1, outputTokens: 1, latencyMs: 1, requestId: null, promptUsed: 'p' } });
    await new SupabasePapersRepo(sb).save({
      teacherId: t.id,
      request: { subject: 'Hindi', language: 'Hindi', grade: 'g', board: 'b', chapter: 'c', assessmentType: 'worksheet', tiers: ['A'], teacherVersion: true, media: [], adjustment: null },
      docxUrl: 'https://x/y.docx',
      totalMarks: 20,
      redoCount: 0,
      pageCount: 3,
      at: now,
    });
    // cleanup (cascade deletes events + generations + papers)
    const { error } = await sb.from('teachers').delete().eq('id', t.id);
    expect(error).toBeNull();
  });

  it('round-trips a signup and a web event, and enforces the phone uniqueness', async () => {
    const { SupabaseSignupRepo, SupabaseWebEventLog } = await import('../src/adapters/supabase.js');
    const { DuplicateSignupError } = await import('../src/domain/web.js');
    const signups = new SupabaseSignupRepo(sb);
    const webEvents = new SupabaseWebEventLog(sb);
    const now = new Date();
    const phone = `+91${String(Date.now()).slice(-10)}`;
    const s = await signups.create({ name: 'Int Test', profession: 'tutor', organization: null, phoneE164: phone, phoneRaw: phone, city: 'Pune', country: 'IN', email: null, emailVerified: null, method: 'manual', source: 'int', now });
    expect(s.joinTappedAt).toBeNull();
    await expect(signups.create({ name: 'Dup', profession: 'tutor', organization: null, phoneE164: phone, phoneRaw: phone, city: 'Pune', country: 'IN', email: null, emailVerified: null, method: 'manual', source: null, now })).rejects.toBeInstanceOf(DuplicateSignupError);
    await signups.markJoinTapped(s.id, now);
    await signups.markJoinTapped(s.id, new Date(now.getTime() + 5000)); // idempotent
    const again = await signups.findById(s.id);
    expect(again?.joinTappedAt?.getTime()).toBe(now.getTime()); // first tap wins; timestamptz keeps ms precision
    await webEvents.log({ visitorId: 'int-visitor', name: 'join_tapped', signupId: s.id }, now);
    const rows = (await webEvents.listAll()).filter((r) => r.signupId === s.id);
    expect(rows).toHaveLength(1);
    await sb.from('signups').delete().eq('id', s.id); // cleanup (cascades web_events.signup_id to null)
  });
});

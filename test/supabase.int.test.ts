import { describe, it, expect, beforeAll } from 'vitest';
import { createSupabase, SupabaseTeacherRepo, SupabaseEventLog, SupabaseGenerationStore } from '../src/adapters/supabase.js';

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

  it('round-trips a teacher, an event and a generation', async () => {
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
    // cleanup (cascade deletes events + generations)
    const { error } = await sb.from('teachers').delete().eq('id', t.id);
    expect(error).toBeNull();
  });
});

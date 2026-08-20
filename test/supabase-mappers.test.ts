import { describe, it, expect } from 'vitest';
import { rowToTeacher, updateToRow, type TeacherRow } from '../src/adapters/supabase.js';

const row: TeacherRow = {
  id: '11111111-1111-1111-1111-111111111111',
  wa_from: 'whatsapp:+911',
  wa_id: '911',
  profile_name: 'Meera',
  grade: 'Middle (Classes 6-8)',
  subject: 'Maths',
  board: 'CBSE',
  state: 'AWAITING_TOPIC',
  current_skill_id: 'worksheet',
  pending_topic: null,
  skills_completed: ['worksheet'],
  retries: 1,
  activated_at: '2026-08-23T10:00:00+00:00',
  last_inbound_at: '2026-08-23T10:05:00+00:00',
  nudge_due_at: null,
  nudge_sent_at: null,
  nudge_count: 0,
  created_at: '2026-08-23T09:00:00+00:00',
  updated_at: '2026-08-23T10:05:00+00:00',
};

describe('rowToTeacher', () => {
  it('maps snake_case + ISO strings to the domain Teacher', () => {
    const t = rowToTeacher(row);
    expect(t.waFrom).toBe('whatsapp:+911');
    expect(t.skillsCompleted).toEqual(['worksheet']);
    expect(t.activatedAt).toEqual(new Date('2026-08-23T10:00:00Z'));
    expect(t.nudgeDueAt).toBeNull();
    expect(t.state).toBe('AWAITING_TOPIC');
    expect(t.currentSkillId).toBe('worksheet');
  });
});

describe('updateToRow', () => {
  it('maps only provided fields and serializes dates', () => {
    const r = updateToRow({ state: 'IDLE', nudgeDueAt: new Date('2026-08-24T04:00:00Z'), nudgeSentAt: null, skillsCompleted: ['worksheet', 'quiz'] });
    expect(r).toEqual({ state: 'IDLE', nudge_due_at: '2026-08-24T04:00:00.000Z', nudge_sent_at: null, skills_completed: ['worksheet', 'quiz'], updated_at: expect.any(String) });
  });
  it('ignores undefined values', () => {
    expect(Object.keys(updateToRow({}))).toEqual(['updated_at']);
  });
});

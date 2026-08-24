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
  school_name: 'Ryan International',
  school_logo_url: null,
  paper_request: null,
  paper_json: null,
  paper_redo_count: 1,
  is_test: false,
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
    expect(t.isTest).toBe(false);
  });
  it('maps is_test = true through', () => {
    expect(rowToTeacher({ ...row, is_test: true }).isTest).toBe(true);
  });
  it('maps paper fields', () => {
    const t = rowToTeacher(row);
    expect(t.schoolName).toBe('Ryan International');
    expect(t.paperRedoCount).toBe(1);
    expect(t.paperJson).toBeNull();
  });
  // Mandatory regression pin (Task 20 review): rowToTeacher previously hardcoded these five to
  // null/0 stopgaps regardless of the row's contents. This would fail if any one of them reverted
  // to a hardcoded default instead of reading its column.
  it('round-trips all five paper columns from the row (none hardcoded)', () => {
    const t = rowToTeacher({
      ...row,
      school_name: 'DAV Public School',
      school_logo_url: 'https://abc.supabase.co/storage/v1/object/public/papers/t1/logo-1.png',
      paper_request: { chapter: 'Fractions' },
      paper_json: { title: 'अभ्यास-पत्र' },
      paper_redo_count: 3,
    });
    expect(t.schoolName).toBe('DAV Public School');
    expect(t.schoolLogoUrl).toBe('https://abc.supabase.co/storage/v1/object/public/papers/t1/logo-1.png');
    expect(t.paperRequest).toEqual({ chapter: 'Fractions' });
    expect(t.paperJson).toEqual({ title: 'अभ्यास-पत्र' });
    expect(t.paperRedoCount).toBe(3);
  });
  it('defaults school/paper fields when their columns are null', () => {
    const t = rowToTeacher({ ...row, school_name: null, school_logo_url: null, paper_request: null, paper_json: null, paper_redo_count: 0 });
    expect(t.schoolName).toBeNull();
    expect(t.schoolLogoUrl).toBeNull();
    expect(t.paperRequest).toBeNull();
    expect(t.paperJson).toBeNull();
    expect(t.paperRedoCount).toBe(0);
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
  it('updateToRow passes jsonb fields as plain objects', () => {
    const r = updateToRow({ paperRequest: { chapter: 'x' } as never, paperRedoCount: 2 });
    expect(r.paper_request).toEqual({ chapter: 'x' });
    expect(r.paper_redo_count).toBe(2);
  });
  // Mandatory regression pin (Task 20 review): updateToRow had NO put() for any of the five new
  // paper fields, so SupabaseTeacherRepo.update silently dropped them in production even though
  // InMemoryTeacherRepo.update (a plain spread) persisted them fine — a green-tests/broken-prod
  // trap. This asserts all five snake_case keys land with the right serialized value; dropping
  // any single put() call makes the corresponding key undefined and fails this test.
  it('maps all five paper fields to their snake_case columns', () => {
    const paperRequest = { chapter: 'Fractions' } as never;
    const paperJson = { title: 'अभ्यास-पत्र' } as never;
    const r = updateToRow({
      schoolName: 'Ryan International',
      schoolLogoUrl: 'https://abc.supabase.co/storage/v1/object/public/papers/t1/logo-1.png',
      paperRequest,
      paperJson,
      paperRedoCount: 2,
    });
    expect(r).toEqual({
      school_name: 'Ryan International',
      school_logo_url: 'https://abc.supabase.co/storage/v1/object/public/papers/t1/logo-1.png',
      paper_request: { chapter: 'Fractions' },
      paper_json: { title: 'अभ्यास-पत्र' },
      paper_redo_count: 2,
      updated_at: expect.any(String),
    });
  });
  it('passes null through for schoolLogoUrl/paperRequest/paperJson (clearing them)', () => {
    const r = updateToRow({ schoolLogoUrl: null, paperRequest: null, paperJson: null });
    expect(r.school_logo_url).toBeNull();
    expect(r.paper_request).toBeNull();
    expect(r.paper_json).toBeNull();
  });
});

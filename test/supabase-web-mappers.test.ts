import { describe, it, expect } from 'vitest';
import { rowToSignup, signupInputToRow, type SignupRow } from '../src/adapters/supabase.js';

describe('signup mappers', () => {
  const row: SignupRow = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Meera', profession: 'school_teacher', organization: null,
    phone_e164: '+919876543210', phone_raw: '98765 43210', city: 'Pune', country: 'IN',
    email: null, email_verified: null, signup_method: 'manual', source: 'grp-a',
    join_tapped_at: '2026-08-23T10:05:00.000Z', teacher_id: null, matched_at: null, created_at: '2026-08-23T10:00:00.000Z',
  };
  it('maps a row to the domain shape with Date fields', () => {
    const s = rowToSignup(row);
    expect(s).toEqual({
      id: row.id, name: 'Meera', profession: 'school_teacher', organization: null, phoneE164: '+919876543210', phoneRaw: '98765 43210',
      city: 'Pune', country: 'IN', email: null, emailVerified: null, method: 'manual', source: 'grp-a', joinTappedAt: new Date('2026-08-23T10:05:00.000Z'), teacherId: null, matchedAt: null,
      createdAt: new Date('2026-08-23T10:00:00.000Z'),
    });
  });
  it('maps a create input to snake_case columns with created_at from now', () => {
    const now = new Date('2026-08-23T10:00:00.000Z');
    expect(signupInputToRow({ name: 'Meera', profession: 'tutor', organization: 'X', phoneE164: '+919876543210', phoneRaw: '98765', city: 'Pune', country: 'IN', email: 'meera@example.com', emailVerified: true, method: 'google', source: null, now })).toEqual({
      name: 'Meera', profession: 'tutor', organization: 'X', phone_e164: '+919876543210', phone_raw: '98765', city: 'Pune', country: 'IN', email: 'meera@example.com', email_verified: true, signup_method: 'google', source: null, created_at: '2026-08-23T10:00:00.000Z',
    });
  });
  it('maps google/manual method and preserves null phone for form signups', () => {
    const s = rowToSignup({ ...row, phone_e164: null, phone_raw: null, city: null, country: null, email: 'jo@x.com', email_verified: true, signup_method: 'google' });
    expect(s).toMatchObject({ phoneE164: null, phoneRaw: null, city: null, country: null, email: 'jo@x.com', emailVerified: true, method: 'google' });
  });
});

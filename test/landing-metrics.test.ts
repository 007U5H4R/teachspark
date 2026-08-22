import { describe, it, expect } from 'vitest';
import { computeLanding, countWebEvents, maskPhone } from '../src/metrics/landing.js';
import type { Signup, WebEventRow } from '../src/domain/web.js';

function signup(over: Partial<Signup> = {}): Signup {
  return {
    id: over.id ?? 'id-1',
    name: 'Meera Sharma',
    profession: 'school_teacher',
    organization: null,
    phoneE164: '+919876543210',
    phoneRaw: '9876543210',
    city: 'Pune',
    country: 'IN',
    source: null,
    joinTappedAt: null,
    teacherId: null,
    matchedAt: null,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    ...over,
  };
}

describe('maskPhone', () => {
  it('keeps only the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('••••• 3210');
  });

  it('handles a country whose national number is not ten digits', () => {
    // The earlier version derived the dialling code as (length - 10), which ate a digit of +971.
    expect(maskPhone('+971501234567')).toBe('••••• 4567');
  });

  it('never leaks digits for a short or malformed value', () => {
    expect(maskPhone('+12')).toBe('••••');
    expect(maskPhone('')).toBe('••••');
  });
});

describe('computeLanding', () => {
  it('counts sign-ups, join taps and reconciled rows separately', () => {
    const rows = [
      signup({ id: 'a', joinTappedAt: new Date() }),
      signup({ id: 'b' }),
      signup({ id: 'c', joinTappedAt: new Date(), teacherId: 't-1' }),
    ];
    const m = computeLanding(rows);
    expect(m.signups).toBe(3);
    expect(m.joinTapped).toBe(2);
    // `matched` is the overlap with the WhatsApp side, not a separate cohort — the dashboard uses
    // it to explain double counting rather than adding the two paths together.
    expect(m.matched).toBe(1);
  });

  it('masks phones by default and only reveals them when explicitly asked', () => {
    const m = computeLanding([signup()]);
    expect(m.recent[0]!.phone).toBe('••••• 3210');
    const full = computeLanding([signup()], { fullPhones: true });
    expect(full.recent[0]!.phone).toBe('+919876543210');
  });

  it('orders tallies by count then name, so equal counts do not shuffle between refreshes', () => {
    const rows = [
      signup({ id: '1', city: 'Pune' }), signup({ id: '2', city: 'Pune' }),
      signup({ id: '3', city: 'Delhi' }), signup({ id: '4', city: 'Bengaluru' }),
    ];
    expect(computeLanding(rows).byCity).toEqual([
      { name: 'Pune', count: 2 },
      { name: 'Bengaluru', count: 1 },
      { name: 'Delhi', count: 1 },
    ]);
  });

  it('buckets a missing source as (unknown) rather than dropping it', () => {
    const m = computeLanding([signup({ id: '1', source: null }), signup({ id: '2', source: '  ' }), signup({ id: '3', source: 'linkedin' })]);
    expect(m.bySource).toEqual([{ name: '(unknown)', count: 2 }, { name: 'linkedin', count: 1 }]);
  });

  it('returns the newest sign-ups first and respects the limit', () => {
    const rows = [
      signup({ id: 'old', createdAt: new Date('2026-08-01T00:00:00Z') }),
      signup({ id: 'new', createdAt: new Date('2026-08-22T00:00:00Z') }),
      signup({ id: 'mid', createdAt: new Date('2026-08-10T00:00:00Z') }),
    ];
    expect(computeLanding(rows).recent.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect(computeLanding(rows, { recentLimit: 2 }).recent.map((r) => r.id)).toEqual(['new', 'mid']);
  });

  it('does not mutate the caller’s array while sorting', () => {
    const rows = [signup({ id: 'a', createdAt: new Date('2026-08-01') }), signup({ id: 'b', createdAt: new Date('2026-08-20') })];
    computeLanding(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('is empty-safe', () => {
    const m = computeLanding([]);
    expect(m).toMatchObject({ signups: 0, joinTapped: 0, matched: 0, byProfession: [], recent: [] });
  });
});

describe('countWebEvents', () => {
  it('counts by name', () => {
    const rows = [
      { visitorId: 'v1', name: 'landing_view', signupId: null, properties: {}, createdAt: new Date() },
      { visitorId: 'v2', name: 'landing_view', signupId: null, properties: {}, createdAt: new Date() },
      { visitorId: 'v1', name: 'join_tapped', signupId: 's1', properties: {}, createdAt: new Date() },
    ] as WebEventRow[];
    expect(countWebEvents(rows)).toEqual({ landing_view: 2, join_tapped: 1 });
  });
});

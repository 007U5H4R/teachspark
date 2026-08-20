import { describe, it, expect } from 'vitest';
import { computeNudgeDueAt, localHour, NUDGE_DELAY_HOURS } from '../src/bot/nudge.js';

const IST = 'Asia/Kolkata';
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('localHour', () => {
  it('reports the hour in the given timezone', () => {
    expect(localHour(new Date('2026-08-23T08:30:00Z'), IST)).toBe(14);
    expect(localHour(new Date('2026-08-23T18:30:00Z'), IST)).toBe(0);
  });
});

describe('computeNudgeDueAt', () => {
  it('is 20 hours later when that is daytime', () => {
    expect(NUDGE_DELAY_HOURS).toBe(20);
    expect(computeNudgeDueAt(ist('2026-08-23T14:00:00'), IST)).toEqual(ist('2026-08-24T10:00:00'));
    expect(computeNudgeDueAt(ist('2026-08-23T20:15:00'), IST)).toEqual(ist('2026-08-24T16:15:00'));
  });
  it('pulls back to 21:xx local when +20h lands in quiet hours', () => {
    expect(computeNudgeDueAt(ist('2026-08-23T09:00:00'), IST)).toEqual(ist('2026-08-23T21:00:00'));
    expect(computeNudgeDueAt(ist('2026-08-23T02:10:00'), IST)).toEqual(ist('2026-08-23T21:10:00'));
    expect(computeNudgeDueAt(ist('2026-08-23T11:45:00'), IST)).toEqual(ist('2026-08-23T21:45:00'));
  });
  it('always stays inside the 24h window and at least 10h out', () => {
    for (let h = 0; h < 24; h++) {
      const start = ist(`2026-08-23T${String(h).padStart(2, '0')}:30:00`);
      const due = computeNudgeDueAt(start, IST);
      const diffH = (due.getTime() - start.getTime()) / 3_600_000;
      expect(diffH).toBeLessThan(24);
      expect(diffH).toBeGreaterThanOrEqual(10);
      const lh = localHour(due, IST);
      expect(lh >= 8 && lh < 22).toBe(true);
    }
  });
});

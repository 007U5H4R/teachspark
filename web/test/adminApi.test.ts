import { describe, it, expect } from 'vitest';
import { nudgeReengagementRate } from '../src/lib/adminApi.ts';

describe('nudgeReengagementRate', () => {
  it('is the returned-over-sent percentage, rounded', () => {
    expect(nudgeReengagementRate(4, 1)).toBe(25);
    expect(nudgeReengagementRate(3, 1)).toBe(33); // 33.33 → 33
    expect(nudgeReengagementRate(8, 3)).toBe(38); // 37.5 → 38
    expect(nudgeReengagementRate(5, 5)).toBe(100);
  });

  it('returns null when no nudge has been sent, so the tile shows "—" not "0%"', () => {
    expect(nudgeReengagementRate(0, 0)).toBeNull();
    expect(nudgeReengagementRate(-1, 0)).toBeNull(); // defensive: never divide by a non-positive
  });

  it('returns 0 when nudges went out but nobody came back', () => {
    expect(nudgeReengagementRate(4, 0)).toBe(0);
  });
});

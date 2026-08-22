import { describe, it, expect, beforeEach } from 'vitest';
import { getVisitorId } from '../src/lib/visitor.ts';

describe('getVisitorId', () => {
  beforeEach(() => localStorage.clear());
  it('creates a UUID once and reuses it', () => {
    const a = getVisitorId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(getVisitorId()).toBe(a);
    expect(localStorage.getItem('ts_visitor')).toBe(a);
  });
});

import { describe, it, expect } from 'vitest';
import { buildCountryOptions, COUNTRY_OPTIONS } from '../src/domain/countries.js';

describe('country options', () => {
  it('includes India with calling code 91 and English names', () => {
    const india = COUNTRY_OPTIONS.find((c) => c.code === 'IN');
    expect(india).toEqual({ code: 'IN', name: 'India', callingCode: '91' });
  });
  it('is sorted by name, has no duplicate codes, and has 200+ entries', () => {
    const names = COUNTRY_OPTIONS.map((c) => c.name);
    expect([...names].sort(new Intl.Collator('en').compare)).toEqual(names);
    expect(new Set(COUNTRY_OPTIONS.map((c) => c.code)).size).toBe(COUNTRY_OPTIONS.length);
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(200);
  });
  it('every option has a two-letter uppercase code and a numeric calling code', () => {
    for (const c of buildCountryOptions()) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.callingCode).toMatch(/^\d{1,4}$/);
      expect(c.name.length).toBeGreaterThan(1);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { phoneDigits, validateSignupForm } from '../src/lib/validate.ts';

const ok = { name: 'Meera Iyer', profession: 'school_teacher', organization: '', phone: '98765 43210', city: 'Pune', country: 'IN' };

describe('validateSignupForm', () => {
  it('accepts a complete form (organization optional)', () => {
    expect(validateSignupForm(ok)).toEqual({});
  });
  it('flags each required field with a human message', () => {
    const e = validateSignupForm({ name: ' ', profession: '', organization: '', phone: '12', city: '', country: '' });
    expect(e.name).toMatch(/name/i);
    expect(e.profession).toMatch(/pick/i);
    expect(e.phone).toMatch(/WhatsApp number/i);
    expect(e.city).toMatch(/city/i);
    expect(e.country).toMatch(/country/i);
  });
  it('requires 6–15 digits in the phone after stripping formatting', () => {
    expect(validateSignupForm({ ...ok, phone: '+91 (98765) 43-210' })).toEqual({});
    expect(validateSignupForm({ ...ok, phone: '1234567890123456' }).phone).toBeDefined();
    expect(phoneDigits('+91 (98765) 43-210')).toBe('919876543210');
  });
});

import { describe, it, expect } from 'vitest';
import { validateSignupForm } from '../src/lib/validate.ts';

const ok = { name: 'Meera Iyer', profession: 'school_teacher', organization: '', city: 'Pune', email: '' };

describe('validateSignupForm', () => {
  it('accepts the trimmed form (only name + profession required; city, org, email optional)', () => {
    expect(validateSignupForm(ok)).toEqual({});
    expect(validateSignupForm({ ...ok, city: '', organization: '' })).toEqual({}); // city/org blank is fine
  });
  it('flags the two required fields with a human message', () => {
    const e = validateSignupForm({ name: ' ', profession: '', organization: '', city: '', email: '' });
    expect(e.name).toMatch(/name/i);
    expect(e.profession).toMatch(/pick/i);
  });
  it('validates email format only when one is present', () => {
    expect(validateSignupForm({ ...ok, email: '' }).email).toBeUndefined();
    expect(validateSignupForm({ ...ok, email: 'jane@school.edu' }).email).toBeUndefined();
    expect(validateSignupForm({ ...ok, email: 'not-an-email' }).email).toMatch(/valid email/i);
  });
});

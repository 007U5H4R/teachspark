import { describe, it, expect } from 'vitest';
import { decodeIdToken, googleClientId } from '../src/lib/googleAuth.ts';

// Build an unsigned JWT with the given payload (only the payload segment is read).
function jwt(payload: object): string {
  const seg = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${seg({ alg: 'none', typ: 'JWT' })}.${seg(payload)}.sig`;
}

describe('decodeIdToken', () => {
  it('extracts name + lowercased email and a boolean email_verified', () => {
    const id = decodeIdToken(jwt({ name: 'Meera Iyer', email: 'Meera.Iyer@School.EDU', email_verified: true }));
    expect(id).toEqual({ name: 'Meera Iyer', email: 'meera.iyer@school.edu', emailVerified: true });
  });
  it('treats the string "true" from some providers as verified, and missing as unverified', () => {
    expect(decodeIdToken(jwt({ email: 'a@b.com', email_verified: 'true' }))?.emailVerified).toBe(true);
    expect(decodeIdToken(jwt({ email: 'a@b.com' }))?.emailVerified).toBe(false);
  });
  it('decodes non-ASCII names correctly (UTF-8, not latin-1)', () => {
    expect(decodeIdToken(jwt({ name: 'José Ramírez', email: 'j@x.com' }))?.name).toBe('José Ramírez');
  });
  it('returns null on no email, a non-JWT string, or garbage', () => {
    expect(decodeIdToken(jwt({ name: 'No Email' }))).toBeNull();
    expect(decodeIdToken('not-a-jwt')).toBeNull();
    expect(decodeIdToken('')).toBeNull();
  });
});

describe('googleClientId', () => {
  it('is undefined when VITE_GOOGLE_CLIENT_ID is not configured (button stays hidden)', () => {
    // The test env sets no client id, so the fast-path is off by default.
    expect(googleClientId()).toBeUndefined();
  });
});

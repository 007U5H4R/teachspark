import { createHmac, timingSafeEqual } from 'node:crypto';

// Stateless admin sessions. The cookie carries its role and its own expiry, plus an HMAC over
// BOTH keyed by ADMIN_TOKEN — so there is no session store to run, and rotating ADMIN_TOKEN
// invalidates every outstanding session at once, which is the revocation mechanism.
//
// The role is inside the signed payload deliberately. If it sat outside, anyone holding a demo
// session could rewrite "demo" to "admin" and unlock the unredacted phone list.

export const ADMIN_COOKIE = 'ts_admin';
export const SESSION_MS = 12 * 60 * 60 * 1000;

/** `admin` sees everything. `demo` sees the same real numbers with individuals anonymised. */
export type Role = 'admin' | 'demo';

const ROLES: readonly string[] = ['admin', 'demo'];
const b64url = (b: Buffer): string => b.toString('base64url');

function sign(role: Role, expiresAtMs: number, secret: string): string {
  return b64url(createHmac('sha256', secret).update(`${role}.${expiresAtMs}`).digest());
}

/** `<role>.<expiresAtMs>.<signature>` */
export function mintSession(role: Role, now: number, secret: string, ttlMs = SESSION_MS): string {
  const exp = now + ttlMs;
  return `${role}.${exp}.${sign(role, exp, secret)}`;
}

/**
 * Compare two strings without leaking their contents through timing.
 *
 * timingSafeEqual throws on a length mismatch, which would itself leak length, so hash both sides
 * to a fixed width first and compare those.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest();
  const hb = createHmac('sha256', 'cmp').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** The role this cookie proves, or null if it is absent, malformed, expired or unsigned. */
export function verifySession(value: string | undefined, now: number, secret: string): Role | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [role, expRaw, sig] = parts as [string, string, string];
  if (!ROLES.includes(role)) return null;
  if (!/^\d{1,15}$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= now) return null;
  return safeEqual(sig, sign(role as Role, exp, secret)) ? (role as Role) : null;
}

/**
 * Read one cookie out of a raw Cookie header. Express 5 can SET cookies without help but does not
 * parse them, and pulling in cookie-parser for a single name is not worth a dependency.
 *
 * Splits at the first '=' of each pair, so base64 padding inside a value cannot truncate it.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const s = part.trim();
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    if (s.slice(0, eq) !== name) continue;
    const raw = s.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw; // a value we did not encode is still worth returning verbatim
    }
  }
  return undefined;
}

/** Serialised Set-Cookie value. `secure` is caller-decided so local http dev still works. */
export function sessionCookie(value: string, secure: boolean, maxAgeMs: number): string {
  const bits = [
    `${ADMIN_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export const clearCookie = (secure: boolean): string => sessionCookie('', secure, 0);

export interface Tokens { adminToken: string; demoToken?: string | undefined }

/** Which role a presented token grants, or null. Both compares run in constant time. */
export function roleForToken(token: string, { adminToken, demoToken }: Tokens): Role | null {
  if (safeEqual(token, adminToken)) return 'admin';
  if (demoToken !== undefined && safeEqual(token, demoToken)) return 'demo';
  return null;
}

/**
 * The role a request proves, via either a valid session cookie or a raw bearer token.
 * Bearer access stays available so existing curl and monitoring keep working.
 */
export function authorisedRole(
  { cookieHeader, authorization }: { cookieHeader?: string; authorization?: string },
  now: number,
  tokens: Tokens,
): Role | null {
  if (authorization?.startsWith('Bearer ')) {
    const role = roleForToken(authorization.slice(7), tokens);
    if (role) return role;
  }
  return verifySession(readCookie(cookieHeader, ADMIN_COOKIE), now, tokens.adminToken);
}

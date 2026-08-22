import { createHmac, timingSafeEqual } from 'node:crypto';

// Stateless admin sessions. The cookie carries its own expiry plus an HMAC of that expiry keyed
// by ADMIN_TOKEN, so there is no session store to run and rotating ADMIN_TOKEN invalidates every
// outstanding session at once — which is the revocation mechanism.

export const ADMIN_COOKIE = 'ts_admin';
export const SESSION_MS = 12 * 60 * 60 * 1000;

const b64url = (b: Buffer): string => b.toString('base64url');

function sign(expiresAtMs: number, secret: string): string {
  return b64url(createHmac('sha256', secret).update(String(expiresAtMs)).digest());
}

/** `<expiresAtMs>.<signature>` */
export function mintSession(now: number, secret: string, ttlMs = SESSION_MS): string {
  const exp = now + ttlMs;
  return `${exp}.${sign(exp, secret)}`;
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

export function verifySession(value: string | undefined, now: number, secret: string): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return false;
  const expRaw = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  // Reject anything non-numeric before Number() turns it into NaN or something exotic.
  if (!/^\d{1,15}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= now) return false;
  return safeEqual(sig, sign(exp, secret));
}

/**
 * Read one cookie out of a raw Cookie header. Express 5 can SET cookies without help but does not
 * parse them, and pulling in cookie-parser for a single name is not worth a dependency.
 *
 * Splits on the LAST '=' boundary per pair rather than the first, so base64 padding in a value
 * cannot truncate it.
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

/** True when the caller presents either a valid session cookie or the raw bearer token. */
export function isAuthorised(
  { cookieHeader, authorization }: { cookieHeader?: string; authorization?: string },
  now: number,
  adminToken: string,
): boolean {
  if (authorization && safeEqual(authorization, `Bearer ${adminToken}`)) return true;
  return verifySession(readCookie(cookieHeader, ADMIN_COOKIE), now, adminToken);
}

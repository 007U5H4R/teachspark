// Admin API client. The session lives in an httpOnly cookie, so nothing here ever holds the
// credential — the browser attaches it and JavaScript cannot read it back.

export interface Tally { name: string; count: number }

export interface RecentSignup {
  id: string;
  name: string;
  profession: string;
  organization: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  method: string;
  joinTappedAt: string | null;
  createdAt: string;
}

export type Role = 'admin' | 'demo';

export interface AdminMetrics {
  role: Role;
  funnel: {
    teachers: number; onboarded: number; activated: number; impactReported: number;
    returnedForSkill2: number; completedBoth: number; medianMinutesSaved: number | null;
    referredCount: number; nudgesSent: number; nudgesReopened: number;
    papersExported: number; medianPaperMinutesSaved: number | null;
    eventCounts: Record<string, number>;
  };
  landing: {
    signups: number; joinTapped: number;
    byProfession: Tally[]; byMethod: Tally[]; byCity: Tally[]; byCountry: Tally[]; bySource: Tally[];
    recent: RecentSignup[];
  };
  webEvents: Record<string, number>;
  generatedAt: string;
}

export class AdminError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AdminError';
  }
}

const JSON_HEADERS = { 'content-type': 'application/json' };

async function post(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'same-origin', // explicit: the session cookie is the whole auth mechanism
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new AdminError(res.status, res.status === 429 ? 'rate_limited' : 'unauthorized');
}

export const login = (token: string): Promise<void> => post('/api/admin/login', { token });
export const logout = (): Promise<void> => post('/api/admin/logout');

export async function hasSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
    if (!res.ok) return false;
    return ((await res.json()) as { authenticated?: boolean }).authenticated === true;
  } catch {
    return false; // offline on first paint is not "logged out", but showing the form is the safe default
  }
}

/**
 * Share of nudged teachers who came back, as a whole-number percent — the "after the nudge" half of
 * the before/after-nudge read. Returns null when no nudge has been sent (a 0/0 rate is meaningless,
 * and "—" reads better than "0%" before the cron has fired for anyone).
 */
export function nudgeReengagementRate(nudgesSent: number, returned: number): number | null {
  if (nudgesSent <= 0) return null;
  return Math.round((returned / nudgesSent) * 100);
}

export async function fetchMetrics(): Promise<AdminMetrics> {
  const res = await fetch('/api/admin/metrics', { credentials: 'same-origin' });
  if (!res.ok) throw new AdminError(res.status, res.status === 401 ? 'unauthorized' : 'server_error');
  return (await res.json()) as AdminMetrics;
}

import type { Signup, WebEventRow } from '../domain/web.js';

// Landing-funnel side of acquisition. Pure, like computeFunnel, so it is testable without a
// database and cannot become a second source of truth.

export interface Tally { name: string; count: number }

export interface RecentSignup {
  id: string;
  name: string;
  profession: string;
  organization: string | null;
  city: string;
  country: string;
  phone: string;              // masked unless the caller explicitly asked for full numbers
  joinTappedAt: string | null;
  createdAt: string;
}

export interface LandingMetrics {
  signups: number;
  joinTapped: number;
  matched: number;            // reconciled to a teacher (Phase 2); explains the overlap
  byProfession: Tally[];
  byCity: Tally[];
  byCountry: Tally[];
  bySource: Tally[];
  recent: RecentSignup[];
}

/**
 * "+919876543210" -> "••••• 3210". Last four digits only.
 *
 * Deliberately does NOT try to preserve the dialling code. Splitting one out means guessing its
 * length from the national number, and an earlier version assumed 10 digits — which is right for
 * India and wrong for the UAE, rendering +971501234567 as "+97 ••••• 4567" with a digit eaten.
 * The country is already its own column wherever this is shown, so the guess bought nothing.
 */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length <= 4) return '•'.repeat(4);
  return `••••• ${digits.slice(-4)}`;
}

function tally(values: Array<string | null>, limit?: number): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v && v.trim() ? v.trim() : '(unknown)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Highest first, then alphabetical, so equal counts do not reorder between refreshes.
  const rows = [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return limit === undefined ? rows : rows.slice(0, limit);
}

export function computeLanding(signups: Signup[], opts: { fullPhones?: boolean; recentLimit?: number } = {}): LandingMetrics {
  const recentLimit = opts.recentLimit ?? 50;
  const newestFirst = [...signups].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return {
    signups: signups.length,
    joinTapped: signups.filter((s) => s.joinTappedAt !== null).length,
    matched: signups.filter((s) => s.teacherId !== null).length,
    byProfession: tally(signups.map((s) => s.profession)),
    byCity: tally(signups.map((s) => s.city), 10),
    byCountry: tally(signups.map((s) => s.country)),
    bySource: tally(signups.map((s) => s.source)),
    recent: newestFirst.slice(0, recentLimit).map((s) => ({
      id: s.id,
      name: s.name,
      profession: s.profession,
      organization: s.organization,
      city: s.city,
      country: s.country,
      phone: opts.fullPhones ? s.phoneE164 : maskPhone(s.phoneE164),
      joinTappedAt: s.joinTappedAt ? s.joinTappedAt.toISOString() : null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

export function countWebEvents(rows: WebEventRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.name] = (out[r.name] ?? 0) + 1;
  return out;
}

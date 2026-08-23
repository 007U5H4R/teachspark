import type { Profession, Signup } from '../domain/web.js';
import type { Funnel } from './funnel.js';

// Synthetic dataset for the demo role only. Nothing here touches a database or a migration — it
// is pure, deterministic data generated in memory from `now` and an index, so the same instant
// always produces the same 40 rows (see test/demo-seed.test.ts). Never imported by the admin path.

/**
 * The 14 cities the demo dataset is spread across, chosen to cover the country (north/south/
 * east/west/north-east). City spelling here is the single source of truth: web/src/components/
 * IndiaMap/cities.ts keys its coordinate lookup off these exact strings.
 */
export const DEMO_CITIES = [
  'Delhi', 'Mumbai', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur',
  'Ahmedabad', 'Lucknow', 'Guwahati', 'Kochi', 'Bhopal', 'Chandigarh',
] as const;

const NAMES = [
  'Aarav Sharma', 'Priya Patel', 'Rohan Mehta', 'Ananya Iyer', 'Vikram Singh', 'Sneha Reddy',
  'Arjun Nair', 'Kavya Rao', 'Ishaan Gupta', 'Diya Bose', 'Karan Malhotra', 'Meera Joshi',
  'Aditya Kumar', 'Riya Chatterjee', 'Siddharth Verma', 'Pooja Desai', 'Nikhil Menon', 'Tanvi Kulkarni',
  'Rahul Bansal', 'Neha Krishnan', 'Aman Chauhan', 'Sanya Agarwal', 'Varun Pillai', 'Ishita Saxena',
  'Kabir Khanna', 'Anjali Mishra', 'Yash Trivedi', 'Simran Kaur', 'Devansh Shah', 'Ritika Bhat',
  'Manoj Yadav', 'Swati Ghosh', 'Harsh Vardhan', 'Nandini Rangan', 'Abhishek Jha', 'Divya Subramanian',
  'Gaurav Sinha', 'Preeti Nambiar', 'Suresh Pandey', 'Lakshmi Venkatesh',
] as const;

// Mostly school_teacher / tutor, with a light sprinkle of the other professions — realistic for a
// teacher-facing product's landing page.
const PROFESSION_CYCLE: Profession[] = [
  'school_teacher', 'school_teacher', 'tutor', 'school_teacher', 'tutor', 'school_teacher',
  'school_leader', 'tutor', 'school_teacher', 'teacher_trainer',
];

const SOURCE_CYCLE: Array<string | null> = [null, 'whatsapp', 'twitter', 'poster', null, 'whatsapp'];

const ORG_BY_PROFESSION: Partial<Record<Profession, string>> = {
  school_teacher: 'Govt. Secondary School',
  school_leader: 'Vidya Mandir School',
  teacher_trainer: 'District Teacher Training Institute',
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Deterministic 10-digit Indian mobile-shaped number from an index. No two collide across 40 rows. */
function phoneFor(i: number): string {
  // Indian mobile numbers start 6-9. Spread deterministically over that range and the last 8 digits.
  const leading = 6 + (i % 4);
  const rest = (7000000 + i * 137) % 100000000;
  return `${leading}${String(rest).padStart(8, '0')}`;
}

export function demoSignups(now: Date): Signup[] {
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Array.from({ length: 40 }, (_, i) => {
    const city = DEMO_CITIES[i % DEMO_CITIES.length]!;
    const name = NAMES[i % NAMES.length]!;
    const profession = PROFESSION_CYCLE[i % PROFESSION_CYCLE.length]!;
    const source = SOURCE_CYCLE[i % SOURCE_CYCLE.length]!;
    const phoneNational = phoneFor(i);
    const phoneE164 = `+91${phoneNational}`;

    // Spread over the last ~14 days: newest index (39) is most recent, oldest (0) is 14 days back.
    // Deterministic function of `now` and `i` — never Date.now() or Math.random().
    const daysAgo = 14 - (i % 14);
    const hourOfDay = 8 + (i % 10); // business hours, 08:00-17:00
    const createdAt = new Date(nowMs - daysAgo * dayMs);
    createdAt.setUTCHours(hourOfDay, (i * 7) % 60, 0, 0);

    // ~55% tapped through to WhatsApp, a bit after signing up.
    const tapped = i % 20 < 11;
    const joinTappedAt = tapped ? new Date(createdAt.getTime() + 15 * 60_000) : null;

    // ~40% matched to a WhatsApp teacher (reconciled).
    const matched = i % 5 < 2;
    const teacherId = matched ? `demo-teacher-${pad2(i + 1)}` : null;
    const matchedAt = matched ? new Date(createdAt.getTime() + 60 * 60_000) : null;

    return {
      id: `demo-signup-${pad2(i + 1)}`,
      name,
      profession,
      organization: ORG_BY_PROFESSION[profession] ?? null,
      phoneE164,
      phoneRaw: phoneNational,
      city,
      country: 'IN',
      source,
      joinTappedAt,
      teacherId,
      matchedAt,
      createdAt,
    } satisfies Signup;
  });
}

export function demoFunnel(): Funnel {
  return {
    teachers: 40,
    onboarded: 38,
    activated: 33,
    impactReported: 24,
    returnedForSkill2: 15,
    completedBoth: 12,
    medianMinutesSaved: 30,
    referredCount: 9,
    nudgesSent: 30,
    nudgesReopened: 14,
    papersExported: 12,
    medianPaperMinutesSaved: 45,
    eventCounts: {
      onboarding_completed: 38,
      impact_reported: 24,
      nudge_sent: 30,
      nudge_reopened: 14,
      referral_reported: 11,
      paper_exported: 12,
      paper_minutes_saved: 12,
    },
  };
}

export function demoWebEvents(): Record<string, number> {
  // Consistent with 40 sign-ups: more views than submits, and fewer taps than submits (matches
  // the ~55% tap rate used in demoSignups).
  return {
    landing_view: 210,
    signup_submitted: 40,
    join_tapped: 22,
  };
}

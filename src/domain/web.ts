// Pre-WhatsApp funnel: a web sign-up and the anonymous events around it.
// These rows exist BEFORE a teachers row does (the bot only knows a teacher after the sandbox join),
// which is why they are separate tables and not more events on the teacher.
export const WEB_EVENT = {
  landing_view: 'landing_view',
  cta_tapped: 'cta_tapped',       // tapped a landing/nav CTA (intent) — the step the old funnel couldn't see
  signup_view: 'signup_view',     // reached the /join form
  signup_failed: 'signup_failed', // a submit that never became a signup (validation / invalid_phone / rate_limited)
  signup_submitted: 'signup_submitted',
  join_tapped: 'join_tapped',
} as const;
export type WebEventName = (typeof WEB_EVENT)[keyof typeof WEB_EVENT];

// Events the browser is allowed to POST to /api/events. signup_submitted is logged server-side only
// (inside the /signup handler), so it is deliberately absent here.
export const CLIENT_WEB_EVENTS = [
  WEB_EVENT.landing_view,
  WEB_EVENT.cta_tapped,
  WEB_EVENT.signup_view,
  WEB_EVENT.signup_failed,
  WEB_EVENT.join_tapped,
] as const;

export const PROFESSIONS = ['school_teacher', 'tutor', 'school_leader', 'teacher_trainer', 'parent', 'student', 'other'] as const;
export type Profession = (typeof PROFESSIONS)[number];

// How a signup was captured. 'manual' = typed the form; 'google' = the optional Continue-with-Google
// fast-path prefilled it. Recorded so /admin can split conversion by method.
export const SIGNUP_METHODS = ['manual', 'google'] as const;
export type SignupMethod = (typeof SIGNUP_METHODS)[number];

export interface Signup {
  id: string;
  name: string;
  profession: Profession;
  organization: string | null;
  // Phone is no longer collected on the form (the bot gets the number from Twilio on the first
  // message), so these are nullable. When present they still serve as the dedupe key.
  phoneE164: string | null;
  phoneRaw: string | null;
  city: string | null;
  country: string | null;   // ISO 3166-1 alpha-2, uppercase
  email: string | null;         // lowercased; present for google signups, optional otherwise
  emailVerified: boolean | null; // as asserted by the identity provider
  method: SignupMethod;
  source: string | null; // optional ?src= attribution from the landing URL
  joinTappedAt: Date | null;
  teacherId: string | null; // filled by Phase 2 reconciliation
  matchedAt: Date | null;
  createdAt: Date;
}

export interface SignupCreateInput {
  name: string;
  profession: Profession;
  organization: string | null;
  phoneE164: string | null;
  phoneRaw: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  emailVerified: boolean | null;
  method: SignupMethod;
  source: string | null;
  now: Date;
}

export interface WebEventRow {
  visitorId: string | null;
  name: WebEventName;
  signupId: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
}

export interface WebEventInput {
  visitorId: string | null;
  name: WebEventName;
  signupId: string | null;
  properties?: Record<string, unknown>;
}

/** Thrown by SignupRepo.create when the phone or email dedupe key already exists; carries the existing row so the API can answer "welcome back". */
export class DuplicateSignupError extends Error {
  constructor(public readonly existing: Signup) {
    super(`signup already exists for ${existing.phoneE164 ?? existing.email ?? existing.id}`);
    this.name = 'DuplicateSignupError';
  }
}

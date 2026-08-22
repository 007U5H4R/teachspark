// Pre-WhatsApp funnel: a web sign-up and the anonymous events around it.
// These rows exist BEFORE a teachers row does (the bot only knows a teacher after the sandbox join),
// which is why they are separate tables and not more events on the teacher.
export const WEB_EVENT = {
  landing_view: 'landing_view',
  signup_submitted: 'signup_submitted',
  join_tapped: 'join_tapped',
} as const;
export type WebEventName = (typeof WEB_EVENT)[keyof typeof WEB_EVENT];

export const PROFESSIONS = ['school_teacher', 'tutor', 'school_leader', 'teacher_trainer', 'parent', 'student', 'other'] as const;
export type Profession = (typeof PROFESSIONS)[number];

export interface Signup {
  id: string;
  name: string;
  profession: Profession;
  organization: string | null;
  phoneE164: string; // canonical key, e.g. "+919876543210"; Phase 2 matches teachers.wa_from = `whatsapp:${phoneE164}`
  phoneRaw: string;  // as typed, for debugging normalization complaints
  city: string;
  country: string;   // ISO 3166-1 alpha-2, uppercase
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
  phoneE164: string;
  phoneRaw: string;
  city: string;
  country: string;
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

/** Thrown by SignupRepo.create when phone_e164 already exists; carries the existing row so the API can answer "welcome back". */
export class DuplicateSignupError extends Error {
  constructor(public readonly existing: Signup) {
    super(`signup already exists for ${existing.phoneE164}`);
    this.name = 'DuplicateSignupError';
  }
}

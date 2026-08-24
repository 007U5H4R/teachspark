import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventRecord, EventRow, SkillId, Teacher, TeacherState, TeacherUpdate } from '../domain/types.js';
import { DuplicateSignupError, type Profession, type Signup, type SignupCreateInput, type WebEventInput, type WebEventName, type WebEventRow } from '../domain/web.js';
import type { EventLog, GenerationSaveInput, GenerationStore, PaperSaveInput, PapersRepo, SignupRepo, TeacherRepo, WebEventLog } from '../ports.js';

export interface TeacherRow {
  id: string;
  wa_from: string;
  wa_id: string | null;
  profile_name: string | null;
  grade: string | null;
  subject: string | null;
  board: string | null;
  state: string;
  current_skill_id: string | null;
  pending_topic: string | null;
  skills_completed: string[];
  retries: number;
  activated_at: string | null;
  last_inbound_at: string | null;
  nudge_due_at: string | null;
  nudge_sent_at: string | null;
  nudge_count: number;
  created_at: string;
  updated_at: string;
  school_name: string | null;
  school_logo_url: string | null;
  paper_request: unknown;
  paper_json: unknown;
  paper_redo_count: number;
  is_test: boolean;
}

const TEACHER_COLUMNS =
  'id, wa_from, wa_id, profile_name, grade, subject, board, state, current_skill_id, pending_topic, skills_completed, retries, activated_at, last_inbound_at, nudge_due_at, nudge_sent_at, nudge_count, created_at, updated_at, school_name, school_logo_url, paper_request, paper_json, paper_redo_count, is_test';

const toDate = (s: string | null): Date | null => (s === null ? null : new Date(s));
const toIso = (d: Date | null | undefined): string | null | undefined => (d === undefined ? undefined : d === null ? null : d.toISOString());

export function rowToTeacher(r: TeacherRow): Teacher {
  return {
    id: r.id,
    waFrom: r.wa_from,
    waId: r.wa_id,
    profileName: r.profile_name,
    grade: r.grade,
    subject: r.subject,
    board: r.board,
    state: r.state as TeacherState,
    currentSkillId: (r.current_skill_id as SkillId | null) ?? null,
    pendingTopic: r.pending_topic,
    skillsCompleted: (r.skills_completed ?? []) as SkillId[],
    retries: r.retries,
    activatedAt: toDate(r.activated_at),
    lastInboundAt: toDate(r.last_inbound_at),
    nudgeDueAt: toDate(r.nudge_due_at),
    nudgeSentAt: toDate(r.nudge_sent_at),
    nudgeCount: r.nudge_count,
    createdAt: new Date(r.created_at),
    schoolName: r.school_name,
    schoolLogoUrl: r.school_logo_url,
    paperRequest: (r.paper_request as Teacher['paperRequest']) ?? null,
    paperJson: (r.paper_json as Teacher['paperJson']) ?? null,
    paperRedoCount: r.paper_redo_count ?? 0,
    isTest: r.is_test ?? false,
  };
}

export function updateToRow(u: TeacherUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v;
  };
  put('wa_id', u.waId);
  put('profile_name', u.profileName);
  put('grade', u.grade);
  put('subject', u.subject);
  put('board', u.board);
  put('state', u.state);
  put('current_skill_id', u.currentSkillId);
  put('pending_topic', u.pendingTopic);
  put('skills_completed', u.skillsCompleted);
  put('retries', u.retries);
  put('activated_at', toIso(u.activatedAt));
  put('last_inbound_at', toIso(u.lastInboundAt));
  put('nudge_due_at', toIso(u.nudgeDueAt));
  put('nudge_sent_at', toIso(u.nudgeSentAt));
  put('nudge_count', u.nudgeCount);
  put('school_name', u.schoolName);
  put('school_logo_url', u.schoolLogoUrl);
  put('paper_request', u.paperRequest);
  put('paper_json', u.paperJson);
  put('paper_redo_count', u.paperRedoCount);
  out.updated_at = new Date().toISOString();
  return out;
}

export function createSupabase(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} failed [${res.error.code ?? '?'}]: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what} returned no data`);
  return res.data;
}

export class SupabaseTeacherRepo implements TeacherRepo {
  constructor(private sb: SupabaseClient) {}

  async findByWaFrom(waFrom: string): Promise<Teacher | null> {
    const res = await this.sb.from('teachers').select(TEACHER_COLUMNS).eq('wa_from', waFrom).maybeSingle();
    if (res.error) throw new Error(`findByWaFrom failed: ${res.error.message}`);
    return res.data ? rowToTeacher(res.data as TeacherRow) : null;
  }

  async create(input: { waFrom: string; waId: string | null; profileName: string | null; now: Date }): Promise<Teacher> {
    const res = await this.sb
      .from('teachers')
      .insert({ wa_from: input.waFrom, wa_id: input.waId, profile_name: input.profileName, created_at: input.now.toISOString(), updated_at: input.now.toISOString() })
      .select(TEACHER_COLUMNS)
      .single();
    return rowToTeacher(unwrap(res, 'teachers.insert') as TeacherRow);
  }

  async update(id: string, updates: TeacherUpdate): Promise<Teacher> {
    const res = await this.sb.from('teachers').update(updateToRow(updates)).eq('id', id).select(TEACHER_COLUMNS).single();
    return rowToTeacher(unwrap(res, 'teachers.update') as TeacherRow);
  }

  async findNudgeDue(now: Date): Promise<Teacher[]> {
    const res = await this.sb.from('teachers').select(TEACHER_COLUMNS).lte('nudge_due_at', now.toISOString()).is('nudge_sent_at', null).limit(500);
    return (unwrap(res, 'teachers.findNudgeDue') as TeacherRow[]).map(rowToTeacher);
  }

  async listAll(): Promise<Teacher[]> {
    const res = await this.sb.from('teachers').select(TEACHER_COLUMNS).limit(5000);
    return (unwrap(res, 'teachers.listAll') as TeacherRow[]).map(rowToTeacher);
  }
}

export class SupabaseEventLog implements EventLog {
  constructor(private sb: SupabaseClient) {}

  async log(teacherId: string, event: EventRecord, at: Date): Promise<void> {
    const { error } = await this.sb
      .from('events')
      .insert({ teacher_id: teacherId, name: event.name, skill_id: event.skillId ?? null, properties: event.properties ?? {}, created_at: at.toISOString() });
    if (error) throw new Error(`events.insert failed: ${error.message}`);
  }

  async listAll(): Promise<EventRow[]> {
    const res = await this.sb.from('events').select('teacher_id, name, skill_id, properties, created_at').order('created_at', { ascending: true }).limit(50000);
    const rows = unwrap(res, 'events.listAll') as Array<{ teacher_id: string; name: string; skill_id: string | null; properties: Record<string, unknown>; created_at: string }>;
    return rows.map((r) => ({ teacherId: r.teacher_id, name: r.name, skillId: r.skill_id, properties: r.properties ?? {}, createdAt: new Date(r.created_at) }));
  }
}

export class SupabaseGenerationStore implements GenerationStore {
  constructor(private sb: SupabaseClient) {}

  async save(input: GenerationSaveInput): Promise<void> {
    const { error } = await this.sb.from('generations').insert({
      teacher_id: input.teacherId,
      skill_id: input.skillId,
      topic: input.topic,
      prompt_used: input.result.promptUsed,
      output_text: input.result.text,
      pdf_url: input.pdfUrl,
      model: input.result.model,
      input_tokens: input.result.inputTokens,
      output_tokens: input.result.outputTokens,
      latency_ms: input.result.latencyMs,
      created_at: input.at.toISOString(),
    });
    if (error) throw new Error(`generations.insert failed: ${error.message}`);
  }
}

export class SupabasePapersRepo implements PapersRepo {
  constructor(private sb: SupabaseClient) {}

  async save(input: PaperSaveInput): Promise<void> {
    const { error } = await this.sb.from('papers').insert({
      teacher_id: input.teacherId,
      subject: input.request.subject,
      grade: input.request.grade,
      board: input.request.board,
      chapter: input.request.chapter,
      assessment_type: input.request.assessmentType,
      tiers: input.request.tiers,
      teacher_version: input.request.teacherVersion,
      source: input.pageCount === 0 ? 'chapter' : input.request.media.some((m) => m.contentType === 'application/pdf') ? 'pdf' : 'photos',
      page_count: input.pageCount,
      docx_url: input.docxUrl,
      total_marks: input.totalMarks,
      redo_count: input.redoCount,
      created_at: input.at.toISOString(),
    });
    if (error) throw new Error(`papers.insert failed: ${error.message}`);
  }
}

export interface SignupRow {
  id: string;
  name: string;
  profession: string;
  organization: string | null;
  phone_e164: string | null;
  phone_raw: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  email_verified: boolean | null;
  signup_method: string;
  source: string | null;
  join_tapped_at: string | null;
  teacher_id: string | null;
  matched_at: string | null;
  created_at: string;
}

const SIGNUP_COLUMNS = 'id, name, profession, organization, phone_e164, phone_raw, city, country, email, email_verified, signup_method, source, join_tapped_at, teacher_id, matched_at, created_at';

export function rowToSignup(r: SignupRow): Signup {
  return {
    id: r.id,
    name: r.name,
    profession: r.profession as Profession,
    organization: r.organization,
    phoneE164: r.phone_e164,
    phoneRaw: r.phone_raw,
    city: r.city,
    country: r.country,
    email: r.email,
    emailVerified: r.email_verified,
    method: (r.signup_method === 'google' ? 'google' : 'manual'),
    source: r.source,
    joinTappedAt: toDate(r.join_tapped_at),
    teacherId: r.teacher_id,
    matchedAt: toDate(r.matched_at),
    createdAt: new Date(r.created_at),
  };
}

export function signupInputToRow(i: SignupCreateInput): Record<string, unknown> {
  return {
    name: i.name,
    profession: i.profession,
    organization: i.organization,
    phone_e164: i.phoneE164,
    phone_raw: i.phoneRaw,
    city: i.city,
    country: i.country,
    email: i.email,
    email_verified: i.emailVerified,
    signup_method: i.method,
    source: i.source,
    created_at: i.now.toISOString(),
  };
}

export class SupabaseSignupRepo implements SignupRepo {
  constructor(private sb: SupabaseClient) {}

  async create(input: SignupCreateInput): Promise<Signup> {
    const res = await this.sb.from('signups').insert(signupInputToRow(input)).select(SIGNUP_COLUMNS).single();
    if (res.error?.code === '23505') {
      // unique violation on the phone or email partial index: surface the existing row so the API can say "welcome back"
      const existing = (input.phoneE164 && await this.findByPhoneE164(input.phoneE164))
        || (input.email && await this.findByEmail(input.email));
      if (existing) throw new DuplicateSignupError(existing);
    }
    return rowToSignup(unwrap(res, 'signups.insert') as SignupRow);
  }

  async findById(id: string): Promise<Signup | null> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).eq('id', id).maybeSingle();
    if (res.error) throw new Error(`signups.findById failed: ${res.error.message}`);
    return res.data ? rowToSignup(res.data as SignupRow) : null;
  }

  async findByEmail(email: string): Promise<Signup | null> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).eq('email', email.toLowerCase()).maybeSingle();
    if (res.error) throw new Error(`signups.findByEmail failed: ${res.error.message}`);
    return res.data ? rowToSignup(res.data as SignupRow) : null;
  }

  async findByPhoneE164(e164: string): Promise<Signup | null> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).eq('phone_e164', e164).maybeSingle();
    if (res.error) throw new Error(`signups.findByPhoneE164 failed: ${res.error.message}`);
    return res.data ? rowToSignup(res.data as SignupRow) : null;
  }

  async markJoinTapped(id: string, at: Date): Promise<void> {
    // Only the first tap is recorded: the WHERE join_tapped_at IS NULL makes retries no-ops.
    const res = await this.sb.from('signups').update({ join_tapped_at: at.toISOString() }).eq('id', id).is('join_tapped_at', null).select('id');
    if (res.error) throw new Error(`signups.markJoinTapped failed: ${res.error.message}`);
    if ((res.data ?? []).length === 0) {
      const exists = await this.findById(id);
      if (!exists) throw new Error(`signup ${id} not found`);
    }
  }

  async listAll(): Promise<Signup[]> {
    const res = await this.sb.from('signups').select(SIGNUP_COLUMNS).order('created_at', { ascending: true }).limit(5000);
    return (unwrap(res, 'signups.listAll') as SignupRow[]).map(rowToSignup);
  }
}

export class SupabaseWebEventLog implements WebEventLog {
  constructor(private sb: SupabaseClient) {}

  async log(input: WebEventInput, at: Date): Promise<void> {
    const { error } = await this.sb
      .from('web_events')
      .insert({ visitor_id: input.visitorId, name: input.name, signup_id: input.signupId, properties: input.properties ?? {}, created_at: at.toISOString() });
    if (error) throw new Error(`web_events.insert failed: ${error.message}`);
  }

  async listAll(): Promise<WebEventRow[]> {
    const res = await this.sb.from('web_events').select('visitor_id, name, signup_id, properties, created_at').order('created_at', { ascending: true }).limit(50000);
    const rows = unwrap(res, 'web_events.listAll') as Array<{ visitor_id: string | null; name: string; signup_id: string | null; properties: Record<string, unknown>; created_at: string }>;
    return rows.map((r) => ({ visitorId: r.visitor_id, name: r.name as WebEventName, signupId: r.signup_id, properties: r.properties ?? {}, createdAt: new Date(r.created_at) }));
  }
}

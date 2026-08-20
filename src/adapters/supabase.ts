import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventRecord, EventRow, SkillId, Teacher, TeacherState, TeacherUpdate } from '../domain/types.js';
import type { EventLog, GenerationSaveInput, GenerationStore, TeacherRepo } from '../ports.js';

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
}

const TEACHER_COLUMNS =
  'id, wa_from, wa_id, profile_name, grade, subject, board, state, current_skill_id, pending_topic, skills_completed, retries, activated_at, last_inbound_at, nudge_due_at, nudge_sent_at, nudge_count, created_at, updated_at';

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
    // Paper columns are not yet in the teachers table (Task 20 is domain-only) — default until a
    // later task adds the migration + select columns wiring these through.
    schoolName: null,
    schoolLogoUrl: null,
    paperRequest: null,
    paperJson: null,
    paperRedoCount: 0,
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

export type TeacherState =
  | 'NEW'
  | 'AWAITING_GRADE'
  | 'AWAITING_SUBJECT'
  | 'AWAITING_BOARD'
  | 'AWAITING_TOPIC'
  | 'GENERATING'
  | 'AWAITING_IMPACT'
  | 'AWAITING_REFERRAL'
  | 'IDLE';

export type SkillId = 'worksheet' | 'quiz';

export interface Teacher {
  id: string;
  waFrom: string; // opaque Twilio address, e.g. "whatsapp:+919876543210"; reply to it verbatim
  waId: string | null;
  profileName: string | null;
  grade: string | null; // stored option label, e.g. "Middle (Classes 6-8)"
  subject: string | null;
  board: string | null;
  state: TeacherState;
  currentSkillId: SkillId | null;
  pendingTopic: string | null;
  skillsCompleted: SkillId[];
  retries: number; // unrecognized answers in the current menu state
  activatedAt: Date | null; // first worksheet delivered
  lastInboundAt: Date | null;
  nudgeDueAt: Date | null;
  nudgeSentAt: Date | null;
  nudgeCount: number;
  createdAt: Date;
}

export type TeacherUpdate = Partial<Omit<Teacher, 'id' | 'waFrom' | 'createdAt'>>;

export interface EventRecord {
  name: string; // one of EVENT.* in domain/events.ts
  skillId?: SkillId | null;
  properties?: Record<string, unknown>;
}

export interface EventRow {
  teacherId: string;
  name: string;
  skillId: string | null;
  properties: Record<string, unknown>;
  createdAt: Date;
}

export type Action =
  | { type: 'send_text'; body: string }
  | { type: 'send_document'; url: string }
  | { type: 'generate'; skillId: SkillId; topic: string };

export interface Step {
  updates: TeacherUpdate;
  events: EventRecord[];
  actions: Action[];
}

export interface InboundMessage {
  from: string; // Twilio "From"
  waId: string | null;
  profileName: string | null;
  body: string;
  messageSid: string;
  buttonPayload: string | null; // set when a quick-reply button was tapped (stretch Task 19)
}

export interface TeacherProfile {
  grade: string;
  subject: string;
  board: string;
}

export interface GenerationRequest extends TeacherProfile {
  skillId: SkillId;
  topic: string;
}

export interface GenerationResult {
  text: string; // cleaned plain text
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  requestId: string | null;
  promptUsed: string; // the user prompt sent to the model
}

export type GenerationOutcome =
  | { ok: true; result: GenerationResult; pdfUrl: string | null }
  | { ok: false; reason: 'refusal' | 'error' };

export interface SendResult {
  ok: boolean;
  sid: string | null;
  errorCode: number | null; // Twilio error code, e.g. 63016 (outside 24h window), 63015 (not joined)
}

export class GenerationRefusedError extends Error {
  constructor(message = 'model refused') {
    super(message);
    this.name = 'GenerationRefusedError';
  }
}

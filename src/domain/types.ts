export type CoreTeacherState =
  | 'NEW'
  | 'AWAITING_GRADE'
  | 'AWAITING_SUBJECT'
  | 'AWAITING_BOARD'
  | 'AWAITING_TOPIC'
  | 'GENERATING'
  | 'AWAITING_IMPACT'
  | 'AWAITING_REFERRAL'
  | 'IDLE';

export type PaperState =
  | 'PAPER_SUBJECT'    // which language subject (English / Hindi / other)
  | 'PAPER_CHAPTER'    // chapter / poem / prose title
  | 'PAPER_MEDIA'      // collecting photos / PDFs until DONE or SKIP
  | 'PAPER_TYPE'       // homework / worksheet / question paper / case study
  | 'PAPER_TIERS'      // A / B / C / All
  | 'PAPER_KEY'        // teacher version (answer key)? yes / no
  | 'PAPER_SCHOOL'     // school name for the header (first paper only)
  | 'PAPER_LOGO'       // school logo image or SKIP (first paper only)
  | 'PAPER_GENERATING' // model + QC running
  | 'PAPER_PREVIEW'    // preview sent; 1 get file / 2 redo / 3 harder / 4 easier
  | 'PAPER_IMPACT';    // minutes-saved question after the .docx

export type TeacherState = CoreTeacherState | PaperState;

export function isPaperState(s: TeacherState): s is PaperState {
  return s.startsWith('PAPER_');
}

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
  activatedAt: Date | null; // first worksheet delivered, or first paper exported (afterPaperRender)
  lastInboundAt: Date | null;
  nudgeDueAt: Date | null;
  nudgeSentAt: Date | null;
  nudgeCount: number;
  createdAt: Date;
  schoolName: string | null;
  schoolLogoUrl: string | null;
  paperRequest: PaperRequest | null;  // in-progress wizard state (survives restarts)
  paperJson: PaperJson | null;        // last generated paper awaiting preview/render
  paperRedoCount: number;
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
  | { type: 'generate'; skillId: SkillId; topic: string }
  | { type: 'store_logo'; media: InboundMedia }   // NEW: download + persist the school logo
  | { type: 'generate_paper' }                     // NEW: run ingest → generate → QC from teacher.paperRequest
  | { type: 'render_paper' };                      // NEW: render teacher.paperJson → .docx → send

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
  media: InboundMedia[]; // NEW — parsed from Twilio MediaUrl{N}/MediaContentType{N} (Task 22 wires the webhook)
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

export interface InboundMedia {
  url: string;         // Twilio MediaUrl{N}
  contentType: string; // Twilio MediaContentType{N}, e.g. "image/jpeg"
}

/** Lesson-source media the paper generator accepts (gif excluded: Claude reads only the first frame). */
export const LESSON_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export function isLessonMediaType(ct: string): boolean {
  return (LESSON_MEDIA_TYPES as readonly string[]).includes(ct.split(';')[0].trim().toLowerCase());
}

export type PaperAssessmentType = 'homework' | 'worksheet' | 'question_paper' | 'case_study';
export type PaperTierId = 'A' | 'B' | 'C';

export interface PaperRequest {
  subject: string;              // language subject label, e.g. "Hindi"
  language: string;             // language of instruction — same as subject for v1.1
  grade: string;                // from the teacher profile
  board: string;                // from the teacher profile
  chapter: string;
  assessmentType: PaperAssessmentType;
  tiers: PaperTierId[];         // ['A'] | ['B'] | ['C'] | ['A','B','C']
  teacherVersion: boolean;
  media: InboundMedia[];        // collected lesson photos / PDFs (may be empty = chapter-knowledge mode)
  adjustment: 'harder' | 'easier' | null; // set by preview redo options 3/4
}

export type PaperQuestionType = 'MCQ' | 'FIB' | 'SA' | 'LA' | 'CW' | 'CB' | 'MTF' | 'TOF';

export interface PaperQuestion {
  number: number;
  type: PaperQuestionType;
  text: string;
  marks: number;
  options: string[] | null;                          // MCQ only, 4 options, no letter prefixes
  matchPairs: Array<{ left: string; right: string }> | null; // MTF only
  answer: string;                                    // objective answer or expected points
  answerNotes: string | null;                        // rubric / acceptable alternatives
}

export interface PaperTask {
  taskNumber: 1 | 2 | 3 | 4;
  heading: string;          // in the paper's language, e.g. "कार्य 1 — पठन-बोध एवं शब्दज्ञान"
  headingEnglish: string;   // e.g. "Reading Comprehension & Vocabulary"
  instructions: string;
  passage: string | null;   // Task 1 extract from the lesson, when applicable
  questions: PaperQuestion[];
}

export interface PaperTier {
  tier: PaperTierId;
  tierLabel: string;        // "Foundational" | "Proficient" | "Advanced"
  timeMinutes: string;      // "35–40" | "40–45" | "50–60"
  totalMarks: number;
  tasks: PaperTask[];       // exactly 4
}

export interface PaperJson {
  title: string;            // in the paper's language
  language: string;
  gradeLabel: string;
  subjectLabel: string;
  boardLabel: string;
  chapterLabel: string;
  assessmentLabel: string;  // human label for the header, in-language where natural
  generalInstructions: string[];
  tiers: PaperTier[];
  sourceNotes: string[];    // e.g. "Page 3 was too blurry to read — questions avoid that portion."
}

export interface PaperQcReport {
  pass: boolean;
  issues: string[];         // empty when pass
  fixedPaper: PaperJson | null; // QC's repaired paper when it chose to fix inline
}

export interface PaperBranding {
  schoolName: string | null;
  logo: { data: Buffer; contentType: string } | null;
}

export type PaperGenerationOutcome =
  | { ok: true; paper: PaperJson; qc: PaperQcReport }
  | { ok: false; reason: 'refusal' | 'error' | 'no_readable_media' };

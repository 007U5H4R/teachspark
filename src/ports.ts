import type {
  EventRecord,
  EventRow,
  GenerationRequest,
  GenerationResult,
  InboundMedia,
  PaperBranding,
  PaperJson,
  PaperQcReport,
  PaperRequest,
  SendResult,
  Teacher,
  TeacherProfile,
  TeacherUpdate,
} from './domain/types.js';
import type { Signup, SignupCreateInput, WebEventInput, WebEventRow } from './domain/web.js';

export interface Clock {
  now(): Date;
}

export interface TeacherRepo {
  findByWaFrom(waFrom: string): Promise<Teacher | null>;
  create(input: { waFrom: string; waId: string | null; profileName: string | null; now: Date }): Promise<Teacher>;
  update(id: string, updates: TeacherUpdate): Promise<Teacher>;
  /** teachers with nudgeDueAt <= now and nudgeSentAt == null */
  findNudgeDue(now: Date): Promise<Teacher[]>;
  listAll(): Promise<Teacher[]>;
}

export interface EventLog {
  log(teacherId: string, event: EventRecord, at: Date): Promise<void>;
  listAll(): Promise<EventRow[]>;
}

export interface GenerationSaveInput {
  teacherId: string;
  skillId: string;
  topic: string;
  result: GenerationResult;
  pdfUrl: string | null;
  at: Date;
}

export interface GenerationStore {
  save(input: GenerationSaveInput): Promise<void>;
}

export interface Messenger {
  sendText(to: string, body: string): Promise<SendResult>;
  sendDocument(to: string, url: string): Promise<SendResult>;
}

export interface Generator {
  /** throws GenerationRefusedError on stop_reason 'refusal'; throws Error on API failure */
  generate(req: GenerationRequest): Promise<GenerationResult>;
}

export interface PdfSection {
  heading: string;
  body: string;
}

export interface PdfBuilder {
  build(input: { title: string; subtitle: string; sections: PdfSection[]; footer: string }): Promise<Buffer>;
}

export interface PdfStore {
  /** uploads and returns a public HTTPS URL ending in .pdf */
  storeWorksheetPdf(teacherId: string, pdf: Buffer): Promise<string>;
}

export interface FetchedMedia {
  data: Buffer;
  contentType: string; // normalized: image/jpeg, image/png, image/webp, application/pdf
}

export interface MediaFetcher {
  /** downloads a Twilio (or Supabase) media URL; throws on network failure or unsupported/oversized media */
  fetch(media: InboundMedia): Promise<FetchedMedia>;
}

export interface PaperGenInput {
  request: PaperRequest;
  profile: TeacherProfile;
  media: FetchedMedia[];
}

export interface PaperGenerator {
  /** throws GenerationRefusedError on refusal; throws Error on API failure */
  generatePaper(input: PaperGenInput): Promise<{ paper: PaperJson; inputTokens: number; outputTokens: number; latencyMs: number; model: string }>;
  /** validates a generated paper against the QC checklist (PRD §18.7); may return a repaired paper */
  qcPaper(paper: PaperJson, input: PaperGenInput): Promise<PaperQcReport>;
}

export interface DocBuilder {
  /** renders the fixed bilingual template (PRD §18.4) to an editable .docx */
  buildPaperDocx(paper: PaperJson, branding: PaperBranding, teacherVersion: boolean): Promise<Buffer>;
}

export interface PaperStore {
  /** uploads and returns a public HTTPS URL ending in .docx */
  storePaperDocx(teacherId: string, docx: Buffer): Promise<string>;
  /** uploads a logo image and returns its public URL */
  storeLogo(teacherId: string, image: Buffer, contentType: string): Promise<string>;
}

export interface PaperSaveInput {
  teacherId: string;
  request: PaperRequest;
  docxUrl: string;
  totalMarks: number;
  redoCount: number;
  pageCount: number; // media items supplied
  at: Date;
  // model/tokens/latency/QC verdict live in the paper_generated / paper_qc_completed events —
  // the papers row records the artifact, events record the telemetry (single source of truth).
}

export interface PapersRepo {
  save(input: PaperSaveInput): Promise<void>;
}

export interface SignupRepo {
  /** throws DuplicateSignupError when phone_e164 already exists */
  create(input: SignupCreateInput): Promise<Signup>;
  findById(id: string): Promise<Signup | null>;
  findByPhoneE164(e164: string): Promise<Signup | null>;
  /** sets join_tapped_at only if it is still null; throws if id is unknown */
  markJoinTapped(id: string, at: Date): Promise<void>;
  listAll(): Promise<Signup[]>;
}

export interface WebEventLog {
  log(input: WebEventInput, at: Date): Promise<void>;
  listAll(): Promise<WebEventRow[]>;
}

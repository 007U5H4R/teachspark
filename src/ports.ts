import type {
  EventRecord,
  EventRow,
  GenerationRequest,
  GenerationResult,
  SendResult,
  Teacher,
  TeacherUpdate,
} from './domain/types.js';

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

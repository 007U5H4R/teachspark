import { randomUUID } from 'node:crypto';
import type {
  EventRecord,
  EventRow,
  GenerationRequest,
  GenerationResult,
  InboundMedia,
  PaperBranding,
  PaperJson,
  PaperQcReport,
  SendResult,
  Teacher,
  TeacherUpdate,
} from '../domain/types.js';
import { DuplicateSignupError, type Signup, type SignupCreateInput, type WebEventInput, type WebEventRow } from '../domain/web.js';
import type {
  Clock,
  DocBuilder,
  EventLog,
  FetchedMedia,
  GenerationSaveInput,
  GenerationStore,
  Generator,
  MediaFetcher,
  Messenger,
  PaperGenInput,
  PaperGenerator,
  PaperSaveInput,
  PapersRepo,
  PaperStore,
  PdfBuilder,
  PdfSection,
  PdfStore,
  SignupRepo,
  TeacherRepo,
  WebEventLog,
} from '../ports.js';

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  set(d: Date): void {
    this.current = new Date(d.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class InMemoryTeacherRepo implements TeacherRepo {
  private byId = new Map<string, Teacher>();

  async findByWaFrom(waFrom: string): Promise<Teacher | null> {
    for (const t of this.byId.values()) if (t.waFrom === waFrom) return { ...t, skillsCompleted: [...t.skillsCompleted] };
    return null;
  }

  async create(input: { waFrom: string; waId: string | null; profileName: string | null; now: Date }): Promise<Teacher> {
    const t: Teacher = {
      id: randomUUID(),
      waFrom: input.waFrom,
      waId: input.waId,
      profileName: input.profileName,
      grade: null,
      subject: null,
      board: null,
      state: 'NEW',
      currentSkillId: null,
      pendingTopic: null,
      skillsCompleted: [],
      retries: 0,
      activatedAt: null,
      lastInboundAt: null,
      nudgeDueAt: null,
      nudgeSentAt: null,
      nudgeCount: 0,
      createdAt: new Date(input.now.getTime()),
      schoolName: null,
      schoolLogoUrl: null,
      paperRequest: null,
      paperJson: null,
      paperRedoCount: 0,
    };
    this.byId.set(t.id, t);
    return { ...t };
  }

  async update(id: string, updates: TeacherUpdate): Promise<Teacher> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error(`teacher ${id} not found`);
    const next: Teacher = { ...existing, ...updates, skillsCompleted: [...(updates.skillsCompleted ?? existing.skillsCompleted)] };
    this.byId.set(id, next);
    return { ...next };
  }

  async findNudgeDue(now: Date): Promise<Teacher[]> {
    return [...this.byId.values()].filter((t) => t.nudgeDueAt !== null && t.nudgeDueAt.getTime() <= now.getTime() && t.nudgeSentAt === null);
  }

  async listAll(): Promise<Teacher[]> {
    return [...this.byId.values()].map((t) => ({ ...t }));
  }
}

export class InMemoryEventLog implements EventLog {
  rows: EventRow[] = [];
  async log(teacherId: string, event: EventRecord, at: Date): Promise<void> {
    this.rows.push({ teacherId, name: event.name, skillId: event.skillId ?? null, properties: event.properties ?? {}, createdAt: new Date(at.getTime()) });
  }
  async listAll(): Promise<EventRow[]> {
    return [...this.rows];
  }
  names(): string[] {
    return this.rows.map((r) => r.name);
  }
}

export class InMemoryGenerationStore implements GenerationStore {
  saved: GenerationSaveInput[] = [];
  failWith: Error | null = null;
  async save(input: GenerationSaveInput): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.saved.push(input);
  }
}

export interface FakeSend {
  to: string;
  kind: 'text' | 'document';
  body: string | null;
  url: string | null;
}

export class FakeMessenger implements Messenger {
  sent: FakeSend[] = [];
  failWith: number | null = null;
  throwWith: Error | null = null;
  private n = 0;
  async sendText(to: string, body: string): Promise<SendResult> {
    if (this.throwWith) throw this.throwWith;
    if (this.failWith !== null) return { ok: false, sid: null, errorCode: this.failWith };
    this.sent.push({ to, kind: 'text', body, url: null });
    return { ok: true, sid: `SM${++this.n}`, errorCode: null };
  }
  async sendDocument(to: string, url: string): Promise<SendResult> {
    if (this.throwWith) throw this.throwWith;
    if (this.failWith !== null) return { ok: false, sid: null, errorCode: this.failWith };
    this.sent.push({ to, kind: 'document', body: null, url });
    return { ok: true, sid: `SM${++this.n}`, errorCode: null };
  }
  texts(): string[] {
    return this.sent.filter((s) => s.kind === 'text').map((s) => s.body ?? '');
  }
}

export class FakeGenerator implements Generator {
  calls: GenerationRequest[] = [];
  failWith: Error | null = null;
  constructor(private text: string) {}
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    this.calls.push(req);
    if (this.failWith) throw this.failWith;
    return { text: this.text, model: 'fake-model', inputTokens: 100, outputTokens: 200, latencyMs: 5, requestId: null, promptUsed: `fake prompt for ${req.topic}` };
  }
}

export class FakePdfBuilder implements PdfBuilder {
  builds: Array<{ title: string; sections: PdfSection[] }> = [];
  async build(input: { title: string; subtitle: string; sections: PdfSection[]; footer: string }): Promise<Buffer> {
    this.builds.push({ title: input.title, sections: input.sections });
    return Buffer.from(`%PDF-1.4 fake ${input.title}`);
  }
}

export class FakePdfStore implements PdfStore {
  stored: Array<{ teacherId: string; bytes: number }> = [];
  failWith: Error | null = null;
  private n = 0;
  async storeWorksheetPdf(teacherId: string, pdf: Buffer): Promise<string> {
    if (this.failWith) throw this.failWith;
    this.stored.push({ teacherId, bytes: pdf.length });
    return `https://example.test/worksheets/${teacherId}/${++this.n}.pdf`;
  }
}

export class FakeMediaFetcher implements MediaFetcher {
  fetched: InboundMedia[] = [];
  failWith: Error | null = null;
  async fetch(media: InboundMedia): Promise<FetchedMedia> {
    if (this.failWith) throw this.failWith;
    this.fetched.push(media);
    return { data: Buffer.from(`fake-bytes:${media.url}`), contentType: media.contentType };
  }
}

/** A minimal but structurally complete PaperJson for tests. */
export function samplePaperJson(over: Partial<PaperJson> = {}): PaperJson {
  return {
    title: 'अभ्यास-पत्र: टोपी शुक्ला',
    language: 'Hindi',
    gradeLabel: 'High (Classes 9-12)',
    subjectLabel: 'Hindi',
    boardLabel: 'CBSE',
    chapterLabel: 'टोपी शुक्ला',
    assessmentLabel: 'Worksheet',
    generalInstructions: ['सभी प्रश्न अनिवार्य हैं।'],
    tiers: [
      {
        tier: 'A',
        tierLabel: 'Foundational',
        timeMinutes: '35–40',
        totalMarks: 20,
        tasks: [1, 2, 3, 4].map((n) => ({
          taskNumber: n as 1 | 2 | 3 | 4,
          heading: `कार्य ${n}`,
          headingEnglish: ['Reading Comprehension & Vocabulary', 'Language in Use', 'Textual Analysis', 'Creative / Personal Response'][n - 1],
          instructions: 'निर्देश।',
          passage: n === 1 ? 'गद्यांश…' : null,
          questions: [
            // marks must sum to the tier's totalMarks (4 tasks × 5 = 20) — paperShapeIssues() enforces it
            { number: 1, type: n === 1 ? 'MCQ' : 'SA', text: `प्रश्न ${n}.1`, marks: 5, options: n === 1 ? ['क', 'ख', 'ग', 'घ'] : null, matchPairs: null, answer: 'उत्तर', answerNotes: null },
          ],
        })),
      },
    ],
    sourceNotes: [],
    ...over,
  };
}

export class FakePaperGenerator implements PaperGenerator {
  calls: PaperGenInput[] = [];
  qcCalls = 0;
  failWith: Error | null = null;
  qcFailWith: Error | null = null;
  qcReport: PaperQcReport = { pass: true, issues: [], fixedPaper: null };
  constructor(private paper: PaperJson = samplePaperJson()) {}
  async generatePaper(input: PaperGenInput) {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;
    return { paper: this.paper, inputTokens: 5000, outputTokens: 4000, latencyMs: 42, model: 'fake-paper-model' };
  }
  async qcPaper(_paper: PaperJson, _input: PaperGenInput): Promise<PaperQcReport> {
    this.qcCalls += 1;
    if (this.qcFailWith) throw this.qcFailWith;
    return this.qcReport;
  }
}

export class FakeDocBuilder implements DocBuilder {
  builds: Array<{ paper: PaperJson; branding: PaperBranding; teacherVersion: boolean }> = [];
  failWith: Error | null = null;
  async buildPaperDocx(paper: PaperJson, branding: PaperBranding, teacherVersion: boolean): Promise<Buffer> {
    if (this.failWith) throw this.failWith;
    this.builds.push({ paper, branding, teacherVersion });
    return Buffer.from(`PK-fake-docx:${paper.title}`);
  }
}

export class FakePaperStore implements PaperStore {
  storedDocs: Array<{ teacherId: string; bytes: number }> = [];
  storedLogos: Array<{ teacherId: string; contentType: string }> = [];
  failWith: Error | null = null;
  private n = 0;
  async storePaperDocx(teacherId: string, docx: Buffer): Promise<string> {
    if (this.failWith) throw this.failWith;
    this.storedDocs.push({ teacherId, bytes: docx.length });
    return `https://example.test/papers/${teacherId}/${++this.n}.docx`;
  }
  async storeLogo(teacherId: string, _image: Buffer, contentType: string): Promise<string> {
    if (this.failWith) throw this.failWith;
    this.storedLogos.push({ teacherId, contentType });
    return `https://example.test/logos/${teacherId}/${++this.n}.png`;
  }
}

export class InMemoryPapersRepo implements PapersRepo {
  saved: PaperSaveInput[] = [];
  failWith: Error | null = null;
  async save(input: PaperSaveInput): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.saved.push(input);
  }
}

export class InMemorySignupRepo implements SignupRepo {
  private byId = new Map<string, Signup>();

  async create(input: SignupCreateInput): Promise<Signup> {
    // Dedupe only on keys that are actually present: phone when typed, else email.
    if (input.phoneE164) {
      const byPhone = await this.findByPhoneE164(input.phoneE164);
      if (byPhone) throw new DuplicateSignupError(byPhone);
    }
    if (input.email) {
      const byEmail = await this.findByEmail(input.email);
      if (byEmail) throw new DuplicateSignupError(byEmail);
    }
    const s: Signup = {
      id: randomUUID(),
      name: input.name,
      profession: input.profession,
      organization: input.organization,
      phoneE164: input.phoneE164,
      phoneRaw: input.phoneRaw,
      city: input.city,
      country: input.country,
      email: input.email,
      emailVerified: input.emailVerified,
      method: input.method,
      source: input.source,
      joinTappedAt: null,
      teacherId: null,
      matchedAt: null,
      createdAt: new Date(input.now.getTime()),
    };
    this.byId.set(s.id, s);
    return { ...s };
  }

  async findById(id: string): Promise<Signup | null> {
    const s = this.byId.get(id);
    return s ? { ...s } : null;
  }

  async findByPhoneE164(e164: string): Promise<Signup | null> {
    for (const s of this.byId.values()) if (s.phoneE164 === e164) return { ...s };
    return null;
  }

  async findByEmail(email: string): Promise<Signup | null> {
    const key = email.toLowerCase();
    for (const s of this.byId.values()) if (s.email !== null && s.email.toLowerCase() === key) return { ...s };
    return null;
  }

  async markJoinTapped(id: string, at: Date): Promise<void> {
    const s = this.byId.get(id);
    if (!s) throw new Error(`signup ${id} not found`);
    if (s.joinTappedAt === null) this.byId.set(id, { ...s, joinTappedAt: new Date(at.getTime()) });
  }

  async listAll(): Promise<Signup[]> {
    return [...this.byId.values()].map((s) => ({ ...s }));
  }
}

export class InMemoryWebEventLog implements WebEventLog {
  rows: WebEventRow[] = [];
  async log(input: WebEventInput, at: Date): Promise<void> {
    this.rows.push({ visitorId: input.visitorId, name: input.name, signupId: input.signupId, properties: input.properties ?? {}, createdAt: new Date(at.getTime()) });
  }
  async listAll(): Promise<WebEventRow[]> {
    return [...this.rows];
  }
  names(): string[] {
    return this.rows.map((r) => r.name);
  }
}

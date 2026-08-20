import { randomUUID } from 'node:crypto';
import type {
  EventRecord,
  EventRow,
  GenerationRequest,
  GenerationResult,
  SendResult,
  Teacher,
  TeacherUpdate,
} from '../domain/types.js';
import type {
  Clock,
  EventLog,
  GenerationSaveInput,
  GenerationStore,
  Generator,
  Messenger,
  PdfBuilder,
  PdfSection,
  PdfStore,
  TeacherRepo,
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
  async save(input: GenerationSaveInput): Promise<void> {
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
  private n = 0;
  async sendText(to: string, body: string): Promise<SendResult> {
    if (this.failWith !== null) return { ok: false, sid: null, errorCode: this.failWith };
    this.sent.push({ to, kind: 'text', body, url: null });
    return { ok: true, sid: `SM${++this.n}`, errorCode: null };
  }
  async sendDocument(to: string, url: string): Promise<SendResult> {
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

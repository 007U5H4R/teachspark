import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperStore, PdfStore } from '../ports.js';

export async function ensurePublicBucket(sb: SupabaseClient, name: string, allowedMimeTypes: string[] = ['application/pdf']): Promise<void> {
  const { data } = await sb.storage.getBucket(name);
  if (data) return;
  const { error } = await sb.storage.createBucket(name, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes,
  });
  if (error && !/already exists/i.test(error.message)) throw new Error(`createBucket(${name}) failed: ${error.message}`);
}

export const PAPER_BUCKET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class SupabasePdfStore implements PdfStore {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async storeWorksheetPdf(teacherId: string, pdf: Buffer): Promise<string> {
    const path = `${teacherId}/${randomUUID()}.pdf`; // unique path: fresh CDN object, URL ends in .pdf (WhatsApp filename)
    const { data, error } = await this.sb.storage.from(this.bucket).upload(path, pdf, {
      contentType: 'application/pdf', // REQUIRED — default is text/plain
      cacheControl: '3600',
      upsert: false,
    });
    if (error || !data) throw new Error(`pdf upload failed: ${error?.message ?? 'no data'}`);
    const { data: pub } = this.sb.storage.from(this.bucket).getPublicUrl(data.path);
    return pub.publicUrl;
  }
}

export class SupabasePaperStore implements PaperStore {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly bucket: string,
  ) {}

  async storePaperDocx(teacherId: string, docx: Buffer): Promise<string> {
    // unique path; URL must end in .docx — Twilio derives the WhatsApp filename from the URL
    return this.upload(`${teacherId}/${randomUUID()}.docx`, docx, DOCX_CONTENT_TYPE);
  }

  async storeLogo(teacherId: string, image: Buffer, contentType: string): Promise<string> {
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    return this.upload(`${teacherId}/logo-${randomUUID()}.${ext}`, image, contentType);
  }

  private async upload(path: string, body: Buffer, contentType: string): Promise<string> {
    const { data, error } = await this.sb.storage.from(this.bucket).upload(path, body, {
      contentType, // REQUIRED — default is text/plain
      cacheControl: '3600',
      upsert: false,
    });
    if (error || !data) throw new Error(`paper upload failed: ${error?.message ?? 'no data'}`);
    const { data: pub } = this.sb.storage.from(this.bucket).getPublicUrl(data.path);
    return pub.publicUrl;
  }
}

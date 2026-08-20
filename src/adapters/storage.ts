import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PdfStore } from '../ports.js';

export async function ensurePublicBucket(sb: SupabaseClient, name: string): Promise<void> {
  const { data } = await sb.storage.getBucket(name);
  if (data) return;
  const { error } = await sb.storage.createBucket(name, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf'],
  });
  if (error && !/already exists/i.test(error.message)) throw new Error(`createBucket(${name}) failed: ${error.message}`);
}

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

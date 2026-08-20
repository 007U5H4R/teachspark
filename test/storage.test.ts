import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePdfStore, ensurePublicBucket } from '../src/adapters/storage.js';

function fakeSb(
  uploadResult: { data: { path: string } | null; error: { message: string } | null },
  bucketResult: {
    getBucket?: { data: { name: string } | null; error: { message: string } | null };
    createBucket?: { data: { name: string } | null; error: { message: string } | null };
  } = {},
) {
  const upload = vi.fn().mockResolvedValue(uploadResult);
  const getPublicUrl = vi.fn((p: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/worksheets/${p}` } }));
  const getBucket = vi.fn().mockResolvedValue(bucketResult.getBucket ?? { data: null, error: null });
  const createBucket = vi.fn().mockResolvedValue(bucketResult.createBucket ?? { data: { name: 'worksheets' }, error: null });
  const sb = { storage: { from: () => ({ upload, getPublicUrl }), getBucket, createBucket } } as unknown as SupabaseClient;
  return { sb, upload, getPublicUrl, getBucket, createBucket };
}

describe('SupabasePdfStore', () => {
  it('uploads with application/pdf to a unique path and returns a public .pdf url', async () => {
    const { sb, upload } = fakeSb({ data: { path: 't1/abc.pdf' }, error: null });
    const url = await new SupabasePdfStore(sb, 'worksheets').storeWorksheetPdf('t1', Buffer.from('%PDF-x'));
    expect(url).toBe('https://abc.supabase.co/storage/v1/object/public/worksheets/t1/abc.pdf');
    const [path, body, opts] = upload.mock.calls[0];
    expect(path).toMatch(/^t1\/[0-9a-f-]{36}\.pdf$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(opts).toMatchObject({ contentType: 'application/pdf', upsert: false });
  });
  it('throws when the upload errors', async () => {
    const { sb } = fakeSb({ data: null, error: { message: 'nope' } });
    await expect(new SupabasePdfStore(sb, 'worksheets').storeWorksheetPdf('t1', Buffer.from('x'))).rejects.toThrow(/nope/);
  });
});

describe('ensurePublicBucket', () => {
  it('creates the bucket when missing', async () => {
    const { sb, createBucket } = fakeSb({ data: null, error: null });
    await ensurePublicBucket(sb, 'worksheets');
    expect(createBucket).toHaveBeenCalledWith('worksheets', expect.objectContaining({ public: true, allowedMimeTypes: ['application/pdf'] }));
  });
  it('does nothing when the bucket already exists (steady-state path)', async () => {
    const { sb, createBucket } = fakeSb({ data: null, error: null }, { getBucket: { data: { name: 'worksheets' }, error: null } });
    await ensurePublicBucket(sb, 'worksheets');
    expect(createBucket).not.toHaveBeenCalled();
  });
  it('tolerates a concurrent-creation race (already-exists error) without throwing', async () => {
    const { sb } = fakeSb({ data: null, error: null }, { createBucket: { data: null, error: { message: 'The resource already exists' } } });
    await expect(ensurePublicBucket(sb, 'worksheets')).resolves.toBeUndefined();
  });
  it('still throws on a real createBucket error', async () => {
    const { sb } = fakeSb({ data: null, error: null }, { createBucket: { data: null, error: { message: 'permission denied' } } });
    await expect(ensurePublicBucket(sb, 'worksheets')).rejects.toThrow(/permission denied/);
  });
});

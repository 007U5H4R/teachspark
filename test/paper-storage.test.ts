import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePaperStore, PAPER_BUCKET_MIME_TYPES } from '../src/adapters/storage.js';

function fakeSb() {
  const upload = vi.fn().mockImplementation(async (path: string) => ({ data: { path }, error: null }));
  const getPublicUrl = vi.fn((p: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/papers/${p}` } }));
  const sb = { storage: { from: () => ({ upload, getPublicUrl }) } } as unknown as SupabaseClient;
  return { sb, upload };
}

describe('SupabasePaperStore', () => {
  it('uploads the docx with the OOXML content type to a path ending .docx', async () => {
    const { sb, upload } = fakeSb();
    const url = await new SupabasePaperStore(sb, 'papers').storePaperDocx('t1', Buffer.from('PK'));
    expect(url).toMatch(/\/t1\/[0-9a-f-]{36}\.docx$/);
    const [path, , opts] = upload.mock.calls[0];
    expect(path).toMatch(/^t1\/[0-9a-f-]{36}\.docx$/);
    expect(opts).toMatchObject({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false });
  });
  it('uploads logos with their image content type', async () => {
    const { sb, upload } = fakeSb();
    const url = await new SupabasePaperStore(sb, 'papers').storeLogo('t1', Buffer.from('img'), 'image/png');
    expect(url).toMatch(/logo-.+\.png$/);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'image/png' });
  });
  it('bucket mime allowlist covers docx and both logo types', () => {
    expect(PAPER_BUCKET_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(PAPER_BUCKET_MIME_TYPES).toContain('image/png');
    expect(PAPER_BUCKET_MIME_TYPES).toContain('image/jpeg');
  });
});

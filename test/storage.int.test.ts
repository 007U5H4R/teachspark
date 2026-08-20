import { describe, it, expect } from 'vitest';
import { createSupabase } from '../src/adapters/supabase.js';
import { SupabasePdfStore, ensurePublicBucket } from '../src/adapters/storage.js';
import { PdfkitBuilder } from '../src/adapters/pdf.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !key)('Supabase Storage (integration)', () => {
  it('uploads a real PDF and the public URL serves application/pdf', async () => {
    const sb = createSupabase(url ?? '', key ?? '');
    await ensurePublicBucket(sb, process.env.SUPABASE_PDF_BUCKET ?? 'worksheets');
    const pdf = await new PdfkitBuilder().build({ title: 'int test', subtitle: 's', sections: [{ heading: 'H', body: '1. q' }], footer: 'f' });
    const publicUrl = await new SupabasePdfStore(sb, process.env.SUPABASE_PDF_BUCKET ?? 'worksheets').storeWorksheetPdf('int-test', pdf);
    expect(publicUrl).toMatch(/\.pdf$/);
    const res = await fetch(publicUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });
});

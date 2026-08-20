import { describe, it, expect, vi, afterEach } from 'vitest';
import { TwilioMediaFetcher, isSupportedMediaType } from '../src/adapters/media.js';
import { isLessonMediaType } from '../src/domain/types.js';

const OPTS = { accountSid: 'AC1', authToken: 'tok' };
const IMG = { url: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/SM1/Media/ME1', contentType: 'image/jpeg' };

function stubFetch(impl: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('isSupportedMediaType', () => {
  it('accepts jpeg/png/webp/pdf and rejects everything else', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/jpeg; charset=binary']) expect(isSupportedMediaType(t)).toBe(true);
    for (const t of ['video/mp4', 'audio/ogg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/vcard', 'image/gif']) expect(isSupportedMediaType(t)).toBe(false);
  });
});

describe('TwilioMediaFetcher', () => {
  it('fetches with basic auth and follows redirects (undici drops the header cross-origin)', async () => {
    const f = stubFetch(async () => new Response(Buffer.from('jpegbytes'), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    const m = await new TwilioMediaFetcher(OPTS).fetch(IMG);
    expect(m.data.toString()).toBe('jpegbytes');
    expect(m.contentType).toBe('image/jpeg');
    const init = f.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${Buffer.from('AC1:tok').toString('base64')}`);
    expect(init.redirect).toBe('follow');
  });
  it('rejects unsupported declared types without fetching', async () => {
    const f = stubFetch(async () => new Response('x', { status: 200 }));
    await expect(new TwilioMediaFetcher(OPTS).fetch({ url: 'https://api.twilio.com/m/ME2', contentType: 'video/mp4' })).rejects.toThrow(/unsupported/i);
    expect(f).not.toHaveBeenCalled();
  });
  it('rejects a response whose served type is unsupported', async () => {
    stubFetch(async () => new Response(Buffer.from('BEGIN:VCARD'), { status: 200, headers: { 'content-type': 'text/vcard' } }));
    await expect(new TwilioMediaFetcher(OPTS).fetch(IMG)).rejects.toThrow(/unsupported/i);
  });
  it('rejects oversized bodies with the per-type limit', async () => {
    stubFetch(async () => new Response(Buffer.alloc(8 * 1024 * 1024), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    await expect(new TwilioMediaFetcher({ ...OPTS, maxImageBytes: 7 * 1024 * 1024 }).fetch(IMG)).rejects.toThrow(/too large/i);
  });
  it('throws a clear error on a deleted media resource / bad URL', async () => {
    stubFetch(async () => new Response('gone', { status: 404 }));
    await expect(new TwilioMediaFetcher(OPTS).fetch(IMG)).rejects.toThrow(/404/);
  });
});

// Task 20 (8e17132) added isLessonMediaType with non-obvious parsing (strips ";params", lowercases)
// but shipped it untested. Task 22 consumes it via isSupportedMediaType above, so pin the parsing
// behavior directly against domain/types.ts here to close that gap.
describe('isLessonMediaType (domain/types.ts, Task 20 — pinned here)', () => {
  it('strips a trailing parameter before matching', () => {
    expect(isLessonMediaType('image/jpeg; charset=utf-8')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(isLessonMediaType('IMAGE/PNG')).toBe(true);
  });
  it('excludes image/gif (Claude reads only the first frame)', () => {
    expect(isLessonMediaType('image/gif')).toBe(false);
  });
});

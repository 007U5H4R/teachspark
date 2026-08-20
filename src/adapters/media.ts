import { isLessonMediaType, type InboundMedia } from '../domain/types.js';
import type { FetchedMedia, MediaFetcher } from '../ports.js';

// The allowlist itself lives in domain/types.ts (Task 20) so the pure wizard can use it without
// importing an adapter; this module re-exports the check for adapter-side callers.
export const isSupportedMediaType = isLessonMediaType;

export interface TwilioMediaFetcherOptions {
  accountSid: string;
  authToken: string;
  maxImageBytes?: number; // Claude API: 10 MB base64 per image ⇒ ~7 MB raw is safe (WhatsApp caps images at 5 MB anyway)
  maxPdfBytes?: number;   // whole Anthropic request ≤ 32 MB incl. ~33% base64 inflation ⇒ cap the raw PDF well below
}

export class TwilioMediaFetcher implements MediaFetcher {
  private readonly maxImageBytes: number;
  private readonly maxPdfBytes: number;

  constructor(private readonly opts: TwilioMediaFetcherOptions) {
    this.maxImageBytes = opts.maxImageBytes ?? 7 * 1024 * 1024;
    this.maxPdfBytes = opts.maxPdfBytes ?? 18 * 1024 * 1024;
  }

  async fetch(media: InboundMedia): Promise<FetchedMedia> {
    const declared = media.contentType.split(';')[0].trim().toLowerCase();
    if (!isSupportedMediaType(declared)) throw new Error(`unsupported media type: ${declared}`);

    // Twilio enforces HTTP Basic auth on media URLs (all accounts since Jul 2023). The response
    // redirects to a signed CDN URL that rejects a forwarded Authorization header — Node's fetch
    // (undici) strips Authorization on cross-origin redirects, so plain follow is correct.
    //
    // I4 (security): this fetcher is ALSO used to re-fetch a teacher's stored school logo from
    // Supabase Storage (executor.ts's runPaperRender, on every branded render) — the media.url in
    // that call is a supabase.co URL, not a Twilio one. The credential must never be attached to a
    // non-Twilio host, or the WhatsApp account's master Basic-auth secret leaks into that host's
    // access logs on every render. An unparseable url is treated as non-Twilio (never attach).
    let isTwilio: boolean;
    try {
      isTwilio = new URL(media.url).hostname.endsWith('.twilio.com');
    } catch {
      isTwilio = false;
    }
    const auth = `Basic ${Buffer.from(`${this.opts.accountSid}:${this.opts.authToken}`).toString('base64')}`;
    const res = await fetch(media.url, { redirect: 'follow', headers: isTwilio ? { Authorization: auth } : {} });
    if (!res.ok) throw new Error(`media fetch failed: ${res.status} for ${media.url}`);

    const contentType = (res.headers.get('content-type') ?? declared).split(';')[0].trim().toLowerCase();
    if (!isSupportedMediaType(contentType)) throw new Error(`unsupported media type: ${contentType}`);
    const data = Buffer.from(await res.arrayBuffer());
    const limit = contentType === 'application/pdf' ? this.maxPdfBytes : this.maxImageBytes;
    if (data.length > limit) throw new Error(`media too large: ${data.length} bytes (limit ${limit}) for ${media.url}`);
    return { data, contentType };
  }
}

import { getVisitorId } from './visitor.ts';
import { trackAnalytics } from './analytics.ts';

export interface JoinInfo { url: string; code: string; whatsappNumber: string }
export interface CountryOption { code: string; name: string; callingCode: string }
export interface SignupRequest {
  name: string; profession: string;
  organization?: string; city?: string;
  email?: string; emailVerified?: boolean; method: 'manual' | 'google';
  visitorId: string; source?: string;
  website: string; // honeypot — always '' from a real browser
}
export interface SignupResponse { signupId: string; existing: boolean; join: JoinInfo }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly fields?: Record<string, string[]>) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'http_error';
    let fields: Record<string, string[]> | undefined;
    try {
      const body = (await res.json()) as { error?: string; fields?: Record<string, string[]> };
      code = body.error ?? code;
      fields = body.fields;
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, code, fields);
  }
  return (await res.json()) as T;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function submitSignup(body: SignupRequest): Promise<SignupResponse> {
  return parse<SignupResponse>(await fetch('/api/signup', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }));
}

export async function fetchCountries(): Promise<CountryOption[]> {
  return (await parse<{ countries: CountryOption[] }>(await fetch('/api/countries'))).countries;
}

// Events the client is allowed to POST — mirrors CLIENT_WEB_EVENTS on the server (src/domain/web.ts).
export type ClientEventName = 'landing_view' | 'cta_tapped' | 'signup_view' | 'signup_failed' | 'join_tapped';
export interface EventContext { signupId?: string; where?: 'hero' | 'why' | 'nav'; reason?: string }

/** Fire-and-forget funnel event. keepalive lets it survive the navigation that usually follows a tap. */
export function trackEvent(name: ClientEventName, ctx: EventContext = {}): void {
  const { signupId, where, reason } = ctx;
  try {
    const body = JSON.stringify({ visitorId: getVisitorId(), name, signupId, where, reason });
    void fetch('/api/events', { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
  // Mirror the same funnel point to Mixpanel; additive, and a no-op when no token is configured.
  const props = { signupId, where, reason };
  const hasProps = Object.values(props).some((v) => v !== undefined);
  trackAnalytics(name, hasProps ? props : undefined);
}

import { getVisitorId } from './visitor.ts';

export interface JoinInfo { url: string; code: string; whatsappNumber: string }
export interface CountryOption { code: string; name: string; callingCode: string }
export interface SignupRequest {
  name: string; profession: string; organization: string; phone: string; city: string; country: string;
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

/** Fire-and-forget funnel event. keepalive lets it survive the navigation that usually follows a tap. */
export function trackEvent(name: 'landing_view' | 'join_tapped', signupId?: string): void {
  try {
    const body = JSON.stringify({ visitorId: getVisitorId(), name, signupId });
    void fetch('/api/events', { method: 'POST', headers: JSON_HEADERS, body, keepalive: true }).catch(() => {});
  } catch { /* analytics must never break the page */ }
}

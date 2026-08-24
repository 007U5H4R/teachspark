// Google Identity Services (GIS) "Continue with Google" fast-path. Entirely optional and env-gated:
// with no VITE_GOOGLE_CLIENT_ID configured, nothing here loads and the form is unchanged.
//
// We only DECODE the ID token client-side to prefill the form — we do not verify its signature,
// because nothing is gated on it: the person still submits the form, and the server treats the email
// as ordinary (unverified) data. Server-side JWT verification is a future hardening step, not needed
// for a prefill.

export interface GoogleIdentity { name: string; email: string; emailVerified: boolean }

interface GisId {
  initialize(cfg: { client_id: string; callback: (resp: { credential?: string }) => void }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
interface GisWindow { google?: { accounts?: { id?: GisId } } }

/** The configured OAuth client id, or undefined when the fast-path is off. */
export function googleClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

/** Inject the GIS script once and resolve when window.google.accounts.id is available. */
export function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const ready = () => ((window as unknown as GisWindow).google?.accounts?.id ? resolve() : reject(new Error('GIS loaded without accounts.id')));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if ((window as unknown as GisWindow).google?.accounts?.id) return resolve();
      existing.addEventListener('load', ready, { once: true });
      existing.addEventListener('error', () => reject(new Error('failed to load Google Identity Services')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.addEventListener('load', ready, { once: true });
    s.addEventListener('error', () => reject(new Error('failed to load Google Identity Services')), { once: true });
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** The GIS id object, or null if the script hasn't produced it. */
export function gisId(): GisId | null {
  return (window as unknown as GisWindow).google?.accounts?.id ?? null;
}

function b64urlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes); // correct for non-ASCII names
}

/** Decode a Google ID-token JWT payload into the fields we prefill. Returns null on anything malformed. */
export function decodeIdToken(jwt: string): GoogleIdentity | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const p = JSON.parse(b64urlToString(payload)) as { name?: string; email?: string; email_verified?: boolean | string };
    if (!p.email) return null;
    return {
      name: typeof p.name === 'string' ? p.name : '',
      email: p.email.toLowerCase(),
      emailVerified: p.email_verified === true || p.email_verified === 'true',
    };
  } catch {
    return null;
  }
}

// Reset hook for tests — lets a suite re-load GIS with a fresh stub between cases.
export function __resetGisForTest(): void {
  scriptPromise = null;
}

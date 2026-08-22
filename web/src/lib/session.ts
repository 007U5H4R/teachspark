import type { JoinInfo } from './api.ts';

export interface HandOff { signupId: string; name: string; join: JoinInfo }
const HANDOFF = 'ts_handoff';
const SOURCE = 'ts_src';

export function isHandOff(v: unknown): v is HandOff {
  const h = v as HandOff | null;
  return !!h && typeof h.signupId === 'string' && typeof h.name === 'string'
    && !!h.join && typeof h.join.url === 'string' && typeof h.join.code === 'string'
    && typeof h.join.whatsappNumber === 'string';
}

export function saveHandOff(h: HandOff): void {
  try { sessionStorage.setItem(HANDOFF, JSON.stringify(h)); } catch { /* storage blocked: /joined falls back to the router state Join.tsx passes to navigate() */ }
}
export function loadHandOff(): HandOff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isHandOff(parsed) ? parsed : null;
  } catch { return null; }
}
export function saveSource(src: string): void {
  try { sessionStorage.setItem(SOURCE, src.slice(0, 64)); } catch { /* ignore */ }
}
export function loadSource(): string | undefined {
  try { return sessionStorage.getItem(SOURCE) ?? undefined; } catch { return undefined; }
}

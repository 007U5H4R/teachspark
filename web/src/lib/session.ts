import type { JoinInfo } from './api.ts';

export interface HandOff { signupId: string; name: string; join: JoinInfo }
const HANDOFF = 'ts_handoff';
const SOURCE = 'ts_src';

export function saveHandOff(h: HandOff): void {
  try { sessionStorage.setItem(HANDOFF, JSON.stringify(h)); } catch { /* private mode: /joined will still render from state */ }
}
export function loadHandOff(): HandOff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF);
    if (!raw) return null;
    const h = JSON.parse(raw) as HandOff;
    return h && typeof h.signupId === 'string' && typeof h.name === 'string'
      && h.join && typeof h.join.url === 'string' && typeof h.join.code === 'string'
      && typeof h.join.whatsappNumber === 'string' ? h : null;
  } catch { return null; }
}
export function saveSource(src: string): void {
  try { sessionStorage.setItem(SOURCE, src.slice(0, 64)); } catch { /* ignore */ }
}
export function loadSource(): string | undefined {
  try { return sessionStorage.getItem(SOURCE) ?? undefined; } catch { return undefined; }
}

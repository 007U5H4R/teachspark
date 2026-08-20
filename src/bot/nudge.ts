export const NUDGE_DELAY_HOURS = 20;
const HOUR_MS = 3_600_000;
const QUIET_START = 22; // 22:00 local
const QUIET_END = 8; // until 07:59 local

export function localHour(d: Date, tz: string): number {
  const part = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz })
    .formatToParts(d)
    .find((p) => p.type === 'hour')?.value;
  return Number(part ?? '0') % 24;
}

/**
 * When to send the next-day nudge. Must be < 24h after the teacher's last inbound message
 * (Twilio sandbox cannot send templates, so free-form only inside the window).
 */
export function computeNudgeDueAt(lastInboundAt: Date, tz = 'Asia/Kolkata'): Date {
  const candidate = new Date(lastInboundAt.getTime() + NUDGE_DELAY_HOURS * HOUR_MS);
  const h = localHour(candidate, tz);
  if (h >= QUIET_END && h < QUIET_START) return candidate;
  // quiet hours: walk back hour by hour to the most recent 21:xx local
  let d = candidate;
  for (let i = 0; i < 24; i++) {
    d = new Date(d.getTime() - HOUR_MS);
    if (localHour(d, tz) === 21) return d;
  }
  return candidate;
}

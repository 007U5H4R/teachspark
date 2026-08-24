// Behaviour state machine. Pure and DOM-free: given the current machine and an elapsed time it
// returns the next machine, so the whole priority/expiry story is testable without a browser.
import type { Behavior } from './eyeShape.ts';

/** Where the eyes point while a behaviour is active. */
export type GazeMode =
  | 'cursor'   // track the pointer (the default and the resting state)
  | 'up'       // off to the upper side, thinking
  | 'down'     // lowered, error
  | 'away'     // held off to one side, curious
  | 'hold'     // freeze wherever the gaze already is
  | 'rest';    // settle to centre-low, sleeping

export interface BehaviorDef {
  priority: number;
  /** null = sustained until something displaces it or its own condition clears. */
  durationMs: number | null;
  gaze: GazeMode;
  /** Multiplier on the base max eye offset. */
  reach: number;
  blinkOnEnter: boolean;
  /** Collapse just this one eye to a closed lid — a wink. Symmetric expressions leave it unset. */
  wink?: 'left' | 'right';
}

export const BEHAVIORS: Record<Behavior, BehaviorDef> = {
  tracking:  { priority: 0, durationMs: null, gaze: 'cursor', reach: 1,    blinkOnEnter: false },
  sleeping:  { priority: 0, durationMs: null, gaze: 'rest',   reach: 0.15, blinkOnEnter: false },
  waking:    { priority: 1, durationMs: 620,  gaze: 'cursor', reach: 1.15, blinkOnEnter: true },
  thinking:  { priority: 2, durationMs: null, gaze: 'up',     reach: 0.85, blinkOnEnter: false },
  curious:   { priority: 2, durationMs: 900,  gaze: 'away',   reach: 0.9,  blinkOnEnter: false },
  success:   { priority: 3, durationMs: 900,  gaze: 'up',     reach: 0.5,  blinkOnEnter: false },
  attention: { priority: 3, durationMs: 700,  gaze: 'cursor', reach: 1.1,  blinkOnEnter: false },
  error:     { priority: 4, durationMs: 1100, gaze: 'down',   reach: 0.6,  blinkOnEnter: true },
  surprised: { priority: 4, durationMs: 650,  gaze: 'cursor', reach: 1.2,  blinkOnEnter: false },
  // Expressive emotion set (previewable; can be app-wired later). A blink on enter sells the shape
  // change as deliberate rather than a jump.
  happy:     { priority: 3, durationMs: 1200, gaze: 'up',     reach: 0.5,  blinkOnEnter: true },
  sad:       { priority: 3, durationMs: 1400, gaze: 'down',   reach: 0.5,  blinkOnEnter: true },
  angry:     { priority: 4, durationMs: 1100, gaze: 'cursor', reach: 0.7,  blinkOnEnter: true },
  skeptical: { priority: 3, durationMs: 1200, gaze: 'away',   reach: 0.6,  blinkOnEnter: false },
  wide:      { priority: 4, durationMs: 700,  gaze: 'cursor', reach: 1.15, blinkOnEnter: false },
  squint:    { priority: 3, durationMs: 1000, gaze: 'cursor', reach: 0.7,  blinkOnEnter: true },
  bored:     { priority: 2, durationMs: 1400, gaze: 'away',   reach: 0.4,  blinkOnEnter: false },
  focused:   { priority: 3, durationMs: 1200, gaze: 'cursor', reach: 0.85, blinkOnEnter: false },
  mischief:  { priority: 4, durationMs: 1200, gaze: 'cursor', reach: 0.8,  blinkOnEnter: true },
  smug:      { priority: 3, durationMs: 1300, gaze: 'away',   reach: 0.5,  blinkOnEnter: false },
  wink:      { priority: 3, durationMs: 1000, gaze: 'cursor', reach: 0.7,  blinkOnEnter: false, wink: 'left' },
};

export interface Machine {
  base: Extract<Behavior, 'tracking' | 'sleeping'>;
  /** The transient on top of the base, if any. */
  overlay: Behavior | null;
  overlayStartedMs: number;
}

export const initialMachine = (): Machine => ({ base: 'tracking', overlay: null, overlayStartedMs: 0 });

export const activeBehavior = (m: Machine): Behavior => m.overlay ?? m.base;

/**
 * Request a transient behaviour. A request only lands if nothing of higher priority is running —
 * so a validation error is never trampled by the pointer wandering over the CTA, while an error
 * can cut straight through a "curious".
 *
 * Re-requesting the behaviour that is already running restarts its clock rather than being
 * dropped, which is what makes a second failed submit visibly react again.
 */
export function request(m: Machine, next: Behavior, nowMs: number): Machine {
  const incoming = BEHAVIORS[next].priority;
  if (m.overlay) {
    const current = BEHAVIORS[m.overlay].priority;
    if (incoming < current) return m;
    if (incoming === current && m.overlay !== next) return m; // first of equal priority keeps the floor
  }
  return { ...m, overlay: next, overlayStartedMs: nowMs };
}

/** Clear a sustained overlay (one with no duration), e.g. when a submit finishes. */
export function release(m: Machine, which: Behavior): Machine {
  return m.overlay === which ? { ...m, overlay: null, overlayStartedMs: 0 } : m;
}

/** Expire a timed overlay. Sustained overlays (durationMs null) are left for `release`. */
export function tick(m: Machine, nowMs: number): Machine {
  if (!m.overlay) return m;
  const d = BEHAVIORS[m.overlay].durationMs;
  if (d === null) return m;
  return nowMs - m.overlayStartedMs >= d ? { ...m, overlay: null, overlayStartedMs: 0 } : m;
}

export function setBase(m: Machine, base: Machine['base']): Machine {
  return m.base === base ? m : { ...m, base };
}

/**
 * How long a behaviour has been running, 0..1 across its duration. Sustained behaviours report 0
 * so callers cannot accidentally treat them as finishing.
 */
export function progress(m: Machine, nowMs: number): number {
  if (!m.overlay) return 0;
  const d = BEHAVIORS[m.overlay].durationMs;
  if (d === null || d <= 0) return 0;
  return Math.min(1, (nowMs - m.overlayStartedMs) / d);
}

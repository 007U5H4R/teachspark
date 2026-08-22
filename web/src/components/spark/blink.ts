// Blink scheduling. Pure: given a random source it returns a plan, so the variety is testable
// without waiting on wall-clock timers.

export type BlinkKind = 'normal' | 'fast' | 'double' | 'long';

export interface BlinkPlan {
  kind: BlinkKind;
  /** Close/open pairs as [closeAtMs, openAtMs] offsets from the start of the plan. */
  beats: Array<[number, number]>;
  /** When the next plan should be scheduled, offset from this plan's start. */
  nextAtMs: number;
}

const KIND_WEIGHTS: Array<[BlinkKind, number]> = [
  ['normal', 0.6],
  ['fast', 0.16],
  ['double', 0.16],
  ['long', 0.08],
];

export function pickKind(r: number): BlinkKind {
  let acc = 0;
  for (const [kind, w] of KIND_WEIGHTS) {
    acc += w;
    if (r < acc) return kind;
  }
  return 'normal';
}

/**
 * Build one blink plan. `rand` is injected so tests can pin the outcome.
 *
 * Human blink intervals are not uniform — they cluster short with an occasional long gap. Squaring
 * the random value biases toward the short end, which reads as alive; a flat distribution reads
 * like a metronome.
 */
export function planBlink(rand: () => number, fixedIntervalMs?: number): BlinkPlan {
  const kind = fixedIntervalMs === undefined ? pickKind(rand()) : 'normal';
  const beats: Array<[number, number]> =
    kind === 'fast' ? [[0, 90]]
    : kind === 'long' ? [[0, 320]]
    : kind === 'double' ? [[0, 120], [260, 380]]
    : [[0, 140]]; // 140 matches the original implementation and the deterministic test contract
  const end = beats[beats.length - 1]![1];
  const gap = fixedIntervalMs ?? 2200 + Math.pow(rand(), 2) * 5200;
  return { kind, beats, nextAtMs: end + gap };
}

/** Blink openness at a time offset into the plan: 0 = fully open, 1 = shut. */
export function blinkAmount(plan: BlinkPlan, tMs: number): number {
  for (const [close, open] of plan.beats) {
    if (tMs < close || tMs > open) continue;
    const span = open - close;
    if (span <= 0) return 0;
    const p = (tMs - close) / span;
    // Down fast, up a little slower — an eyelid does not close and open symmetrically.
    return p < 0.42 ? p / 0.42 : 1 - (p - 0.42) / 0.58;
  }
  return 0;
}

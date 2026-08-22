// Gaze dynamics. Pure and DOM-free so the interesting behaviour is unit-testable without a browser.
import { clamp } from './eyes.ts';

export interface Spring { x: number; y: number; vx: number; vy: number }

/**
 * Critically-ish damped spring toward a target.
 *
 * The old loop used an exponential lerp, which can only decelerate into its target — it can never
 * overshoot, so the eyes always arrived and stopped dead. A spring carries velocity, so a fast
 * gaze shift slightly overshoots and settles back, which is the difference between "moved" and
 * "looked".
 *
 * `dt` is seconds. Integration is sub-stepped at a fixed 1/120s: a long frame (a janky phone, a
 * backgrounded tab handing back 100ms) would otherwise make an explicit integrator blow up and
 * fling the eyes off the orb.
 */
export function stepSpring(s: Spring, tx: number, ty: number, dt: number, stiffness: number, damping: number): Spring {
  const STEP = 1 / 120;
  let { x, y, vx, vy } = s;
  let remaining = clamp(dt, 0, 0.1);
  while (remaining > 0) {
    const h = Math.min(STEP, remaining);
    remaining -= h;
    vx += (-stiffness * (x - tx) - damping * vx) * h;
    vy += (-stiffness * (y - ty) - damping * vy) * h;
    x += vx * h;
    y += vy * h;
  }
  return { x, y, vx, vy };
}

/**
 * Pointer speed in user-units/second, smoothed. Drives how eagerly the eyes react: a slow drift
 * gets a soft follow, a flick gets a snappier one with more overshoot.
 */
export function smoothSpeed(prev: number, dx: number, dy: number, dt: number): number {
  if (dt <= 0) return prev;
  const inst = Math.hypot(dx, dy) / dt;
  return prev + (inst - prev) * 0.2;
}

export interface Tuning { stiffness: number; damping: number }

/** Fast pointer => stiffer spring and relatively less damping, so the shift lands with a little snap. */
export function tuningForSpeed(speed: number): Tuning {
  const k = clamp(speed / 900, 0, 1);
  return { stiffness: 120 + 190 * k, damping: 22 - 5 * k };
}

/**
 * Micro-saccades: the sub-pixel tremor a real eye never stops making. Two incommensurable
 * frequencies per axis so the pattern never visibly repeats. Amplitude is deliberately about a
 * third of a user unit — if you can consciously see it, it is too big.
 */
export function saccade(tMs: number, amp = 0.35): { x: number; y: number } {
  return {
    x: amp * (Math.sin(tMs / 310) * 0.6 + Math.sin(tMs / 97) * 0.4),
    y: amp * (Math.cos(tMs / 271) * 0.6 + Math.cos(tMs / 113) * 0.4),
  };
}

/** Slow vertical bob, used while thinking and sleeping to suggest breathing. */
export function breathe(tMs: number, amp: number, periodMs: number): number {
  return amp * Math.sin((tMs / periodMs) * Math.PI * 2);
}

/**
 * Idle "looking around": centre -> left -> centre -> right -> centre, held at each stop.
 * Returns a multiplier on the max offset, not a position, so it composes with wherever the orb
 * happens to be looking.
 */
export function lookAround(elapsedMs: number, maxOffset: number): { x: number; y: number; done: boolean } {
  const LEG = 700;
  const legs: Array<[number, number]> = [[0, 0], [-1, -0.15], [0, 0], [1, -0.15], [0, 0]];
  const i = Math.floor(elapsedMs / LEG);
  if (i >= legs.length - 1) return { x: 0, y: 0, done: true };
  const t = (elapsedMs % LEG) / LEG;
  const a = legs[i]!;
  const b = legs[i + 1]!;
  // Ease in-out so each leg starts and ends at rest rather than jerking between stops.
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return { x: (a[0] + (b[0] - a[0]) * e) * maxOffset, y: (a[1] + (b[1] - a[1]) * e) * maxOffset, done: false };
}

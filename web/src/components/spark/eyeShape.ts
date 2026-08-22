// Parametric eye geometry. Pure, DOM-free and unit-tested, matching the philosophy of eyes.ts.
//
// The orb's original eyes were five pre-drawn SVG paths cross-faded by opacity. That can express
// exactly five things and cannot blend between them, so nothing could overshoot, settle, droop or
// go subtly asymmetric. Here an eye is a parameter vector instead, and every expression is a point
// in that space — which is what makes interpolation, overshoot and partial blends possible.
import { clamp, lerp } from './eyes.ts';

export interface EyeShape {
  w: number;       // half-width, user units
  h: number;       // half-height — the blink and the sleepy lid both live here
  r: number;       // corner radius
  spread: number;  // extra outward x offset per eye (widens on surprise)
  lift: number;    // y offset; negative is up
  opacity: number;
  tilt: number;    // degrees, signed outward — small values read as mood, large as cartoon
}

export const NEUTRAL: EyeShape = { w: 18, h: 31, r: 16, spread: 0, lift: 0, opacity: 1, tilt: 0 };

/** Deltas from NEUTRAL. Kept as partials so a behaviour only states what it changes. */
export const SHAPE_BY_BEHAVIOR = {
  tracking: {},
  attention: { w: 19, h: 33, spread: 1 },
  // Wider and further apart, lifted slightly. Restraint matters: past about +4 spread this stops
  // reading as surprise and starts reading as a cartoon.
  surprised: { w: 20, h: 36, spread: 3, lift: -1.5 },
  curious: { w: 18, h: 29, tilt: 5, lift: -1 },     // tilt is applied outward per eye => asymmetry
  thinking: { w: 17, h: 26, lift: -2 },             // slight narrowing, gaze goes up and away
  success: { w: 19, h: 34, lift: -1 },
  error: { w: 17, h: 24, lift: 2 },                 // narrowed and looking down
  sleeping: { w: 18, h: 4, r: 3, lift: 6 },         // lids down to a bar, resting low
  waking: { w: 19, h: 33, lift: 0 },
} as const satisfies Record<string, Partial<EyeShape>>;

export type Behavior = keyof typeof SHAPE_BY_BEHAVIOR;

export function shapeFor(b: Behavior): EyeShape {
  return { ...NEUTRAL, ...SHAPE_BY_BEHAVIOR[b] };
}

export function lerpShape(a: EyeShape, b: EyeShape, t: number): EyeShape {
  const k = clamp(t, 0, 1);
  return {
    w: lerp(a.w, b.w, k),
    h: lerp(a.h, b.h, k),
    r: lerp(a.r, b.r, k),
    spread: lerp(a.spread, b.spread, k),
    lift: lerp(a.lift, b.lift, k),
    opacity: lerp(a.opacity, b.opacity, k),
    tilt: lerp(a.tilt, b.tilt, k),
  };
}

/**
 * Collapse an eye toward a closed lid. `t` is 0 (open) to 1 (shut).
 * The radius follows the height so a mid-blink eye never looks like a rounded-off brick, and the
 * height floors at 2 rather than 0 so the eye stays a visible line instead of vanishing.
 */
export function applyBlink(s: EyeShape, t: number): EyeShape {
  const k = clamp(t, 0, 1);
  const h = Math.max(2, s.h * (1 - k));
  return { ...s, h, r: Math.min(s.r, h) };
}

/**
 * SVG rect attributes for one eye. `side` flips `spread` and `tilt` so the pair mirrors outward
 * rather than both leaning the same way, which would read as the whole face sliding.
 */
export function eyeRect(s: EyeShape, cx: number, cy: number, side: 'left' | 'right') {
  const dir = side === 'left' ? -1 : 1;
  const x = cx + dir * s.spread - s.w;
  const y = cy + s.lift - s.h;
  return {
    x: +x.toFixed(2),
    y: +y.toFixed(2),
    width: +(s.w * 2).toFixed(2),
    height: +(s.h * 2).toFixed(2),
    rx: +Math.min(s.r, s.w, s.h).toFixed(2),
    opacity: +s.opacity.toFixed(3),
    transform: s.tilt === 0 ? undefined : `rotate(${(dir * s.tilt).toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})`,
  };
}

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
  curve: number;   // bows the top+bottom edges: +1 an upward (happy) crescent, -1 a downward (sad) one
}

export const NEUTRAL: EyeShape = { w: 18, h: 31, r: 16, spread: 0, lift: 0, opacity: 1, tilt: 0, curve: 0 };

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
  // Expressive set (robot-emotion geometry via tilt + curve; previewable, not yet app-wired):
  happy: { w: 22, h: 9, r: 8, lift: 3, curve: 1 },      // wide, thin, upward crescents — a smile in the eyes
  sad: { w: 19, h: 12, r: 10, lift: 3, tilt: -7, curve: -0.85 }, // inner corners up + a clear downward droop
  angry: { w: 19, h: 21, r: 13, lift: -1, tilt: -11 },  // sharp inward-down slant, no curve — a stern glare
  skeptical: { w: 18, h: 13, r: 10, lift: 1, tilt: -3 },// heavy-lidded narrow squint, faint slant
  wide: { w: 13, h: 13, r: 13, spread: 1 },             // small round eyes — shocked / caught-off-guard
  squint: { w: 18, h: 8, r: 7, tilt: -9 },              // ">< " narrowed inward slant — playful or strained
  bored: { w: 19, h: 4, r: 2, lift: 1 },                // flat thin dashes — unimpressed / deadpan
  focused: { w: 16, h: 22, r: 9, lift: -1, tilt: -4 },  // narrowed, faintly slanted — locked in, determined
  mischief: { w: 21, h: 15, r: 4, lift: 0, tilt: -17 }, // sharp low-radius corners + a hard inward slant — a menacing glare
  smug: { w: 21, h: 9, r: 6, lift: 3 },                 // wide, low, heavy-lidded — unimpressed / too-cool
  wink: { w: 22, h: 9, r: 8, lift: 3, curve: 1 },       // both eyes happy crescents; the loop shuts one (BEHAVIORS.wink.wink)
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
    curve: lerp(a.curve, b.curve, k),
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
  // A closing eye flattens: fade the crescent out as the lid comes down so a mid-blink happy eye
  // does not look like a kinked line.
  return { ...s, h, r: Math.min(s.r, h), curve: s.curve * (1 - k) };
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

// How many user units the edge midpoints rise per unit of `curve`. Tuned so curve:1 reads as a
// clear smile-crescent without the shape folding over itself.
const BOW_UNIT = 15;
const f2 = (n: number): number => +n.toFixed(2);

/**
 * SVG path for one eye: a rounded rectangle whose top and bottom edges bow by `curve`. At curve 0
 * the edges are straight, so the shape is exactly the rounded rect eyeRect() describes (same
 * bounding box, same corner radius) — the neutral eye is unchanged. Positive curve lifts both edges
 * into an upward crescent (happy); negative dips them (sad). `transform` mirrors tilt like eyeRect.
 */
export function eyePath(s: EyeShape, cx: number, cy: number, side: 'left' | 'right') {
  const dir = side === 'left' ? -1 : 1;
  const w = s.w, h = s.h;
  const x0 = cx + dir * s.spread - w;
  const x1 = x0 + w * 2;
  const midx = x0 + w;
  const y0 = cy + s.lift - h;
  const y1 = y0 + h * 2;
  const rx = Math.min(s.r, w, h);
  const bow = s.curve * BOW_UNIT; // edge midpoints rise by `bow`; the Q control is twice that
  // Rounded rect via quadratic corners, but the top and bottom straight runs become quadratics
  // whose control sits `2*bow` above the edge — so the midpoint lifts by `bow` (0 => a straight line).
  const d = [
    `M ${f2(x0 + rx)} ${f2(y0)}`,
    `Q ${f2(midx)} ${f2(y0 - 2 * bow)} ${f2(x1 - rx)} ${f2(y0)}`,      // top edge (bowed)
    `Q ${f2(x1)} ${f2(y0)} ${f2(x1)} ${f2(y0 + rx)}`,                   // top-right corner
    `L ${f2(x1)} ${f2(y1 - rx)}`,                                       // right edge
    `Q ${f2(x1)} ${f2(y1)} ${f2(x1 - rx)} ${f2(y1)}`,                   // bottom-right corner
    `Q ${f2(midx)} ${f2(y1 - 2 * bow)} ${f2(x0 + rx)} ${f2(y1)}`,       // bottom edge (bowed)
    `Q ${f2(x0)} ${f2(y1)} ${f2(x0)} ${f2(y1 - rx)}`,                   // bottom-left corner
    `L ${f2(x0)} ${f2(y0 + rx)}`,                                       // left edge
    `Q ${f2(x0)} ${f2(y0)} ${f2(x0 + rx)} ${f2(y0)}`,                   // top-left corner
    'Z',
  ].join(' ');
  return {
    d,
    opacity: +s.opacity.toFixed(3),
    transform: s.tilt === 0 ? undefined : `rotate(${(dir * s.tilt).toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})`,
  };
}

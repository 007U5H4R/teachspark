// Pure geometry for Spark's eyes. No DOM here so it is trivially testable.
export interface Point { x: number; y: number }
export type EyeState = 'default' | 'puppy' | 'starry' | 'blink' | 'happy' | 'love' | 'dizzy' | 'money' | 'confused' | 'dead';
export type Mood = Exclude<EyeState, 'blink'>;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Vector from the eye toward the pointer, scaled so it saturates at maxOffset once the pointer is `reach` away. */
export function eyeOffset(eye: Point, pointer: Point | null, maxOffset: number, reach = 240): Point {
  if (!pointer) return { x: 0, y: 0 };
  const dx = pointer.x - eye.x;
  const dy = pointer.y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  const k = Math.min(1, dist / reach) * maxOffset;
  return { x: (dx / dist) * k, y: (dy / dist) * k };
}

/** Small parallax tilt of the whole orb toward the pointer (degrees for rotateX/rotateY). */
export function orbTilt(center: Point, pointer: Point | null, maxDeg: number, reach = 600): { rx: number; ry: number } {
  if (!pointer) return { rx: 0, ry: 0 };
  const nx = clamp((pointer.x - center.x) / reach, -1, 1);
  const ny = clamp((pointer.y - center.y) / reach, -1, 1);
  return { rx: -ny * maxDeg, ry: nx * maxDeg };
}

export function starPath(cx: number, cy: number, outerR: number, innerR: number, points = 5): string {
  const step = Math.PI / points;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + i * step;
    const x = (cx + Math.cos(a) * r).toFixed(2);
    const y = (cy + Math.sin(a) * r).toFixed(2);
    d += (i === 0 ? 'M' : 'L') + `${x} ${y}`;
  }
  return d + 'Z';
}

/**
 * A downward-pointing heart centred at (cx, cy), sized so it spans roughly ±r. Built from the
 * classic two-lobe cubic-Bézier heart, scaled from its reference ±9 box.
 */
export function heartPath(cx: number, cy: number, r: number): string {
  const s = r / 9;
  const p = (x: number, y: number): string => `${(cx + x * s).toFixed(2)} ${(cy + y * s).toFixed(2)}`;
  return [
    `M ${p(0, 9)}`,
    `C ${p(0, 9)} ${p(-9, 1.5)} ${p(-9, -3.5)}`,   // down the left side to the left lobe
    `C ${p(-9, -6.5)} ${p(-6.5, -9)} ${p(-3.5, -9)}`,
    `C ${p(-1.5, -9)} ${p(0, -7.5)} ${p(0, -7.5)}`, // up to the top-centre dip
    `C ${p(0, -7.5)} ${p(1.5, -9)} ${p(3.5, -9)}`,
    `C ${p(6.5, -9)} ${p(9, -6.5)} ${p(9, -3.5)}`,  // over the right lobe
    `C ${p(9, 1.5)} ${p(0, 9)} ${p(0, 9)}`,         // back down to the point
    'Z',
  ].join(' ');
}

/**
 * An Archimedean spiral (a stroked path, not a fill) centred at (cx, cy), winding out to `maxR`
 * over `turns` revolutions — the "dizzy" eye. Meant to be spun by CSS.
 */
export function spiralPath(cx: number, cy: number, maxR: number, turns = 2.5, steps = 64): string {
  const total = turns * 2 * Math.PI;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * total;
    const rr = t * maxR;
    const x = (cx + Math.cos(a) * rr).toFixed(2);
    const y = (cy + Math.sin(a) * rr).toFixed(2);
    d += (i === 0 ? 'M' : 'L') + `${x} ${y}`;
  }
  return d;
}

/** Blink overrides everything; hover = puppy eyes, but only when nothing more specific is going on. */
export function resolveEyeState({ mood, hovered, blinking }: { mood: Mood; hovered: boolean; blinking: boolean }): EyeState {
  if (blinking) return 'blink';
  if (hovered && mood === 'default') return 'puppy';
  return mood;
}

/** Where a touch-device Spark "looks": a slow Lissajous wander around the orb. */
export function idlePointer(tMs: number, center: Point): Point {
  return { x: center.x + 150 * Math.sin(tMs / 1900), y: center.y + 90 * Math.cos(tMs / 2300) };
}

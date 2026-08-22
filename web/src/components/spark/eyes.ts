// Pure geometry for Spark's eyes. No DOM here so it is trivially testable.
export interface Point { x: number; y: number }
export type EyeState = 'default' | 'puppy' | 'starry' | 'blink' | 'happy';
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

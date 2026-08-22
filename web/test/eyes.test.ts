import { describe, it, expect } from 'vitest';
import { clamp, eyeOffset, idlePointer, lerp, orbTilt, resolveEyeState, starPath } from '../src/components/spark/eyes.ts';

describe('eyeOffset', () => {
  const eye = { x: 100, y: 100 };
  it('is zero with no pointer or a pointer on the eye', () => {
    expect(eyeOffset(eye, null, 14)).toEqual({ x: 0, y: 0 });
    expect(eyeOffset(eye, { x: 100, y: 100 }, 14)).toEqual({ x: 0, y: 0 });
  });
  it('points toward the pointer and saturates at maxOffset', () => {
    const far = eyeOffset(eye, { x: 1000, y: 100 }, 14);
    expect(far.x).toBeCloseTo(14);
    expect(far.y).toBeCloseTo(0);
    const up = eyeOffset(eye, { x: 100, y: -1000 }, 14);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-14);
  });
  it('scales smoothly inside the reach', () => {
    const near = eyeOffset(eye, { x: 160, y: 100 }, 14, 240); // 60/240 of the way
    expect(near.x).toBeCloseTo(3.5);
  });
});

describe('orbTilt', () => {
  it('tilts toward the pointer, clamped to maxDeg, inverted on the x axis', () => {
    const c = { x: 0, y: 0 };
    expect(orbTilt(c, null, 8)).toEqual({ rx: 0, ry: 0 });
    const right = orbTilt(c, { x: 10_000, y: 0 }, 8);
    expect(right.rx).toBeCloseTo(0);
    expect(right.ry).toBeCloseTo(8);
    const down = orbTilt(c, { x: 0, y: 10_000 }, 8);
    expect(down.rx).toBeCloseTo(-8);
    expect(down.ry).toBeCloseTo(0);
    expect(orbTilt(c, { x: 300, y: 0 }, 8, 600).ry).toBeCloseTo(4);
  });
});

describe('helpers', () => {
  it('lerp and clamp', () => {
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it('starPath builds a closed 5-point star', () => {
    const d = starPath(0, 0, 10, 4);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L')).toHaveLength(10); // 10 vertices: M + 9 L
  });
  it('idlePointer stays within the orb and moves over time', () => {
    const c = { x: 200, y: 190 };
    const a = idlePointer(0, c);
    const b = idlePointer(1500, c);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeLessThan(200);
    expect(a).not.toEqual(b);
  });
});

describe('resolveEyeState', () => {
  it('blink beats everything, hover gives puppy only on default mood, mood otherwise', () => {
    expect(resolveEyeState({ mood: 'starry', hovered: true, blinking: true })).toBe('blink');
    expect(resolveEyeState({ mood: 'default', hovered: true, blinking: false })).toBe('puppy');
    expect(resolveEyeState({ mood: 'starry', hovered: true, blinking: false })).toBe('starry');
    expect(resolveEyeState({ mood: 'happy', hovered: false, blinking: false })).toBe('happy');
    expect(resolveEyeState({ mood: 'default', hovered: false, blinking: false })).toBe('default');
  });
});

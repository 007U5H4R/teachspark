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
  it('starPath builds a closed 5-point star that alternates outer and inner radii', () => {
    const d = starPath(0, 0, 10, 4);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.split('L')).toHaveLength(10); // 10 vertices: M + 9 L
    // The structural assertions above are also satisfied by a decagon (outerR at every vertex),
    // so pin the actual geometry: it must start at the top outer point and alternate radii.
    expect(d).toContain('M0.00 -10.00'); // first vertex: straight up, at outerR
    expect(d).toContain('L2.35 -3.24');  // second vertex: at innerR
    const radii = (d.match(/-?\d+\.\d{2} -?\d+\.\d{2}/g) ?? []).map((pair) => {
      const [x, y] = pair.split(' ').map(Number) as [number, number];
      return Math.hypot(x, y);
    });
    expect(radii).toHaveLength(10);
    expect(radii.filter((r) => Math.abs(r - 10) < 0.01)).toHaveLength(5); // 5 outer points
    expect(radii.filter((r) => Math.abs(r - 4) < 0.01)).toHaveLength(5);  // 5 inner notches
  });
  it('idlePointer wanders a bounded envelope around the centre and keeps moving', () => {
    const c = { x: 200, y: 190 };
    // Sweep a full beat of the two periods rather than sampling t=0, where the distance is
    // exactly 90 and so proves almost nothing.
    let max = 0;
    for (let t = 0; t <= 60_000; t += 25) {
      const p = idlePointer(t, c);
      max = Math.max(max, Math.hypot(p.x - c.x, p.y - c.y));
    }
    expect(max).toBeGreaterThan(150); // it really does roam past the orb radius...
    expect(max).toBeLessThan(175);    // ...but never past hypot(150, 90) = 174.93
    expect(idlePointer(0, c)).not.toEqual(idlePointer(1500, c));
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

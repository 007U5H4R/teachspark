import { describe, it, expect } from 'vitest';
import { activeBehavior, BEHAVIORS, initialMachine, progress, release, request, setBase, tick } from '../src/components/spark/sparkState.ts';
import { applyBlink, eyeRect, lerpShape, NEUTRAL, shapeFor } from '../src/components/spark/eyeShape.ts';
import { blinkAmount, pickKind, planBlink } from '../src/components/spark/blink.ts';
import { breathe, lookAround, saccade, smoothSpeed, stepSpring, tuningForSpeed } from '../src/components/spark/gaze.ts';

describe('sparkState priority', () => {
  it('starts tracking with no overlay', () => {
    const m = initialMachine();
    expect(activeBehavior(m)).toBe('tracking');
  });

  it('a higher priority overlay pre-empts a lower one, and a lower one cannot', () => {
    let m = request(initialMachine(), 'curious', 0);      // priority 2
    expect(activeBehavior(m)).toBe('curious');
    m = request(m, 'error', 10);                          // priority 4 wins
    expect(activeBehavior(m)).toBe('error');
    m = request(m, 'curious', 20);                        // priority 2 is refused
    expect(activeBehavior(m)).toBe('error');
    // This is the case that matters in the product: a validation error must not be trampled by
    // the pointer happening to wander over the CTA.
    expect(BEHAVIORS.error.priority).toBeGreaterThan(BEHAVIORS.curious.priority);
  });

  it('an equal-priority request does not displace a different behaviour, but re-requesting the same one restarts its clock', () => {
    let m = request(initialMachine(), 'success', 0);      // priority 3
    m = request(m, 'attention', 10);                      // also 3, different -> refused
    expect(activeBehavior(m)).toBe('success');
    m = request(m, 'success', 500);                       // same -> restarts
    expect(m.overlayStartedMs).toBe(500);
  });

  it('expires a timed overlay and falls back to the base', () => {
    let m = request(initialMachine(), 'surprised', 0);
    const d = BEHAVIORS.surprised.durationMs!;
    m = tick(m, d - 1);
    expect(activeBehavior(m)).toBe('surprised');
    m = tick(m, d);
    expect(activeBehavior(m)).toBe('tracking');
  });

  it('never expires a sustained overlay; release clears it', () => {
    let m = request(initialMachine(), 'thinking', 0);
    expect(BEHAVIORS.thinking.durationMs).toBeNull();
    m = tick(m, 10_000_000);
    expect(activeBehavior(m)).toBe('thinking');   // a hung request must not silently resolve
    m = release(m, 'thinking');
    expect(activeBehavior(m)).toBe('tracking');
  });

  it('release only clears the behaviour it names', () => {
    const m = request(initialMachine(), 'thinking', 0);
    expect(activeBehavior(release(m, 'error'))).toBe('thinking');
  });

  it('falls back to a sleeping base rather than tracking when one is set', () => {
    let m = setBase(initialMachine(), 'sleeping');
    m = request(m, 'waking', 0);
    expect(activeBehavior(m)).toBe('waking');
    m = setBase(m, 'tracking');
    m = tick(m, BEHAVIORS.waking.durationMs!);
    expect(activeBehavior(m)).toBe('tracking');
  });

  it('progress reports 0 for sustained overlays so they cannot be mistaken for finishing', () => {
    const m = request(initialMachine(), 'thinking', 0);
    expect(progress(m, 5000)).toBe(0);
    const timed = request(initialMachine(), 'error', 0);
    expect(progress(timed, BEHAVIORS.error.durationMs! / 2)).toBeCloseTo(0.5, 2);
    expect(progress(timed, 10_000)).toBe(1);
  });
});

describe('eyeShape', () => {
  it('lerps between two shapes and clamps t', () => {
    const a = shapeFor('tracking');
    const b = shapeFor('sleeping');
    expect(lerpShape(a, b, 0)).toEqual(a);
    expect(lerpShape(a, b, 1)).toEqual(b);
    expect(lerpShape(a, b, 2).h).toBe(b.h);       // clamped, not extrapolated
    expect(lerpShape(a, b, 0.5).h).toBeCloseTo((a.h + b.h) / 2, 5);
  });

  it('blink collapses height but never to zero, and the radius follows it', () => {
    const open = applyBlink(NEUTRAL, 0);
    expect(open.h).toBe(NEUTRAL.h);
    const shut = applyBlink(NEUTRAL, 1);
    expect(shut.h).toBe(2);                       // stays a visible line
    expect(shut.r).toBeLessThanOrEqual(shut.h);   // otherwise a mid-blink eye is a rounded brick
    expect(applyBlink(NEUTRAL, 0.5).h).toBeCloseTo(NEUTRAL.h / 2, 5);
  });

  it('mirrors spread and tilt outward so the pair never leans the same way', () => {
    const s = { ...NEUTRAL, spread: 4, tilt: 6 };
    const l = eyeRect(s, 160, 182, 'left');
    const r = eyeRect(s, 240, 182, 'right');
    expect(l.x).toBeLessThan(160 - s.w);          // left eye pushed further left
    expect(r.x).toBeGreaterThan(240 - s.w);       // right eye pushed further right
    expect(l.transform).toContain('-6');
    expect(r.transform).toContain('6');
  });

  it('omits the transform entirely when there is no tilt', () => {
    expect(eyeRect(NEUTRAL, 160, 182, 'left').transform).toBeUndefined();
  });

  it('surprise widens and lifts; sleeping lowers the lid', () => {
    expect(shapeFor('surprised').h).toBeGreaterThan(NEUTRAL.h);
    expect(shapeFor('surprised').lift).toBeLessThan(0);   // negative is up
    expect(shapeFor('sleeping').h).toBeLessThan(NEUTRAL.h / 2);
    expect(shapeFor('error').lift).toBeGreaterThan(0);    // looking down
  });
});

describe('gaze dynamics', () => {
  it('the spring converges on its target', () => {
    let s = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < 240; i++) s = stepSpring(s, 10, -6, 1 / 60, 180, 22);
    expect(s.x).toBeCloseTo(10, 1);
    expect(s.y).toBeCloseTo(-6, 1);
  });

  it('survives an absurd frame delta instead of exploding', () => {
    // A backgrounded tab can hand back a huge delta; an unclamped explicit integrator would fling
    // the eyes off the orb and never recover.
    let s = { x: 0, y: 0, vx: 0, vy: 0 };
    s = stepSpring(s, 10, 10, 5, 300, 20);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(100);
  });

  it('a fast pointer gets a stiffer, less damped spring than a slow one', () => {
    const slow = tuningForSpeed(0);
    const fast = tuningForSpeed(2000);
    expect(fast.stiffness).toBeGreaterThan(slow.stiffness);
    expect(fast.damping).toBeLessThan(slow.damping);
  });

  it('smoothSpeed eases toward the instantaneous speed and ignores a zero delta', () => {
    expect(smoothSpeed(0, 10, 0, 0)).toBe(0);
    const once = smoothSpeed(0, 10, 0, 0.1);   // instantaneous 100
    expect(once).toBeGreaterThan(0);
    expect(once).toBeLessThan(100);            // smoothed, not snapped
  });

  it('saccades stay imperceptible and keep moving', () => {
    for (let t = 0; t < 5000; t += 137) {
      const s = saccade(t);
      expect(Math.hypot(s.x, s.y)).toBeLessThan(0.75); // sub-unit: if you can see it, it is wrong
    }
    expect(saccade(0)).not.toEqual(saccade(1500));
  });

  it('lookAround returns to centre and reports done', () => {
    expect(lookAround(0, 14).x).toBeCloseTo(0, 5);
    const mid = lookAround(700, 14);
    expect(Math.abs(mid.x)).toBeGreaterThan(0);
    expect(lookAround(10_000, 14).done).toBe(true);
    expect(lookAround(10_000, 14).x).toBe(0);   // never leaves the gaze parked off-centre
  });

  it('breathe oscillates around zero', () => {
    expect(breathe(0, 2, 1000)).toBeCloseTo(0, 5);
    expect(breathe(250, 2, 1000)).toBeCloseTo(2, 5);
    expect(breathe(750, 2, 1000)).toBeCloseTo(-2, 5);
  });
});

describe('blink planning', () => {
  it('a fixed interval always yields the deterministic normal blink the tests rely on', () => {
    const p = planBlink(() => 0.99, 1000);
    expect(p.kind).toBe('normal');
    expect(p.beats).toEqual([[0, 140]]);
    expect(p.nextAtMs).toBe(1140);
  });

  it('picks every kind across the weight range', () => {
    expect(pickKind(0)).toBe('normal');
    expect(pickKind(0.65)).toBe('fast');
    expect(pickKind(0.8)).toBe('double');
    expect(pickKind(0.99)).toBe('long');
  });

  it('a double blink has two beats with a gap between them', () => {
    const p = planBlink(() => 0.8);
    expect(p.kind).toBe('double');
    expect(p.beats).toHaveLength(2);
    expect(p.beats[1]![0]).toBeGreaterThan(p.beats[0]![1]); // reopens before closing again
  });

  it('blinkAmount opens and shuts within a beat and is zero outside one', () => {
    const p = planBlink(() => 0, 1000);      // beats [[0,140]]
    expect(blinkAmount(p, -1)).toBe(0);
    expect(blinkAmount(p, 0)).toBe(0);
    expect(blinkAmount(p, 59)).toBeCloseTo(1, 1); // shut at the 42% mark
    expect(blinkAmount(p, 140)).toBeCloseTo(0, 5);
    expect(blinkAmount(p, 500)).toBe(0);
  });

  it('closes faster than it opens, the way a lid actually moves', () => {
    const p = planBlink(() => 0, 1000);
    const closing = blinkAmount(p, 30) - blinkAmount(p, 15);
    const opening = blinkAmount(p, 90) - blinkAmount(p, 105);
    expect(closing).toBeGreaterThan(opening);
  });
});

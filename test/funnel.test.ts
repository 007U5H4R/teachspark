import { describe, it, expect } from 'vitest';
import { computeFunnel } from '../src/metrics/funnel.js';
import type { EventRow, Teacher } from '../src/domain/types.js';

const at = new Date('2026-08-23T10:00:00Z');
const ev = (teacherId: string, name: string, properties: Record<string, unknown> = {}): EventRow =>
  ({ teacherId, name, skillId: null, properties, createdAt: at });
const teacher = (id: string, over: Partial<Teacher> = {}): Teacher => ({
  id, waFrom: `whatsapp:+${id}`, waId: null, profileName: null, grade: null, subject: null, board: null,
  state: 'NEW', currentSkillId: null, pendingTopic: null, skillsCompleted: [], retries: 0,
  activatedAt: null, lastInboundAt: null, nudgeDueAt: null, nudgeSentAt: null, nudgeCount: 0, createdAt: at,
  schoolName: null, schoolLogoUrl: null, paperRequest: null, paperJson: null, paperRedoCount: 0,
  ...over,
});

describe('computeFunnel', () => {
  it('counts the funnel stages and medians', () => {
    const teachers = [
      teacher('a', { activatedAt: at, skillsCompleted: ['worksheet', 'quiz'] }),
      teacher('b', { activatedAt: at, skillsCompleted: ['worksheet'] }),
      teacher('c'),
    ];
    const events: EventRow[] = [
      ev('a', 'onboarding_completed'), ev('b', 'onboarding_completed'),
      ev('a', 'impact_reported', { minutes: 30 }), ev('a', 'impact_reported', { minutes: 45 }),
      ev('b', 'impact_reported', { minutes: 15 }), ev('c', 'impact_reported', { minutes: null }),
      ev('a', 'referral_reported', { forwarded: true }), ev('b', 'referral_reported', { forwarded: false }),
      ev('a', 'nudge_sent'), ev('a', 'nudge_reopened'),
    ];
    const f = computeFunnel(events, teachers);
    expect(f.teachers).toBe(3);
    expect(f.onboarded).toBe(2);
    expect(f.activated).toBe(2);
    expect(f.impactReported).toBe(2);     // distinct teachers with numeric minutes
    expect(f.medianMinutesSaved).toBe(30); // [15,30,45]
    expect(f.returnedForSkill2).toBe(1);   // distinct teachers with nudge_reopened
    expect(f.completedBoth).toBe(1);
    expect(f.referredCount).toBe(1);
    expect(f.nudgesSent).toBe(1);
    expect(f.nudgesReopened).toBe(1);
    expect(f.eventCounts.impact_reported).toBe(4);
  });
  it('handles empty inputs', () => {
    const f = computeFunnel([], []);
    expect(f.teachers).toBe(0);
    expect(f.medianMinutesSaved).toBeNull();
  });
});

import type { EventRow, Teacher } from '../domain/types.js';
import { EVENT } from '../domain/events.js';

export interface Funnel {
  teachers: number;
  onboarded: number;
  activated: number;
  impactReported: number;
  returnedForSkill2: number;
  completedBoth: number;
  medianMinutesSaved: number | null;
  referredCount: number;
  nudgesSent: number;
  nudgesReopened: number;
  papersExported: number;                 // count of paper_exported events
  medianPaperMinutesSaved: number | null; // over numeric paper_minutes_saved minutes
  eventCounts: Record<string, number>;
}

function distinct(events: EventRow[], name: string, filter: (e: EventRow) => boolean = () => true): number {
  return new Set(events.filter((e) => e.name === name && filter(e)).map((e) => e.teacherId)).size;
}

export function computeFunnel(events: EventRow[], teachers: Teacher[]): Funnel {
  const eventCounts: Record<string, number> = {};
  for (const e of events) eventCounts[e.name] = (eventCounts[e.name] ?? 0) + 1;

  const minutes: number[] = [];
  const perTeacherMinutes = new Set<string>();
  for (const e of events) {
    if (e.name === EVENT.impact_reported && typeof e.properties.minutes === 'number') {
      minutes.push(e.properties.minutes);
      perTeacherMinutes.add(e.teacherId);
    }
  }
  minutes.sort((a, b) => a - b);
  const median = minutes.length === 0 ? null : minutes.length % 2 ? minutes[(minutes.length - 1) / 2] : (minutes[minutes.length / 2 - 1] + minutes[minutes.length / 2]) / 2;

  const paperMinutes: number[] = [];
  for (const e of events) {
    if (e.name === EVENT.paper_minutes_saved && typeof e.properties.minutes === 'number') paperMinutes.push(e.properties.minutes);
  }
  paperMinutes.sort((a, b) => a - b);
  const paperMedian =
    paperMinutes.length === 0 ? null : paperMinutes.length % 2 ? paperMinutes[(paperMinutes.length - 1) / 2] : (paperMinutes[paperMinutes.length / 2 - 1] + paperMinutes[paperMinutes.length / 2]) / 2;

  return {
    teachers: teachers.length,
    onboarded: distinct(events, EVENT.onboarding_completed),
    activated: teachers.filter((t) => t.activatedAt !== null).length,
    impactReported: perTeacherMinutes.size,
    returnedForSkill2: distinct(events, EVENT.nudge_reopened),
    completedBoth: teachers.filter((t) => t.skillsCompleted.length >= 2).length,
    medianMinutesSaved: median,
    referredCount: distinct(events, EVENT.referral_reported, (e) => e.properties.forwarded === true),
    nudgesSent: eventCounts[EVENT.nudge_sent] ?? 0,
    nudgesReopened: eventCounts[EVENT.nudge_reopened] ?? 0,
    papersExported: eventCounts[EVENT.paper_exported] ?? 0,
    medianPaperMinutesSaved: paperMedian,
    eventCounts,
  };
}

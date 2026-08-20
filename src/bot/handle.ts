import type { InboundMessage, Teacher } from '../domain/types.js';
import { EVENT } from '../domain/events.js';
import { Executor, type ExecutorDeps } from './executor.js';
import { transition } from './machine.js';
import * as msg from './messages.js';

export function createInboundHandler(deps: ExecutorDeps): (message: InboundMessage) => Promise<void> {
  const executor = new Executor(deps);
  // Per handler instance (the composition root builds exactly one): tracks teacher ids
  // currently being processed, so a teacher who double-texts while a generation is running
  // gets a "still working" reply instead of a second concurrent run. Deliberately in-memory
  // only -- it does NOT survive a process restart. That is intentional and paired with Task 9's
  // stale-GENERATING escape (machine.ts, STALE_GENERATION_MS): a teacher stuck GENERATING
  // because the process died mid-generation recovers via the stale-inbound check there, not via
  // this set. Also deliberately per-process: this pilot runs a single instance, so no
  // cross-instance coordination is needed.
  const inFlight = new Set<string>();

  return async function handleInbound(message: InboundMessage): Promise<void> {
    let teacher: Teacher | null = null;
    try {
      const now = deps.clock.now();
      teacher = await deps.teachers.findByWaFrom(message.from);
      if (!teacher) {
        teacher = await deps.teachers.create({ waFrom: message.from, waId: message.waId, profileName: message.profileName, now });
        await deps.events.log(teacher.id, { name: EVENT.session_started, properties: { profileName: message.profileName } }, now);
      }
      if (inFlight.has(teacher.id)) {
        await deps.events.log(teacher.id, { name: EVENT.still_working_sent, properties: { reason: 'in_flight' } }, now);
        await deps.messenger.sendText(teacher.waFrom, msg.stillWorking());
        return;
      }
      inFlight.add(teacher.id);
      try {
        const step = transition({ teacher, message, now, joinLink: deps.joinLink, timezone: deps.timezone });
        await executor.runStep(teacher, step);
      } finally {
        inFlight.delete(teacher.id);
      }
    } catch (err) {
      console.error('[handle] inbound failed', err);
      if (teacher) {
        try {
          await deps.events.log(
            teacher.id,
            { name: EVENT.error_occurred, properties: { where: 'handle', message: err instanceof Error ? err.message : String(err) } },
            deps.clock.now(),
          );
        } catch {
          /* never let telemetry failure break the ACK */
        }
      }
      try {
        await deps.messenger.sendText(message.from, msg.somethingWentWrong());
      } catch {
        /* nothing left to do */
      }
    }
  };
}

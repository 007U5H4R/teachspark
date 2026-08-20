import type { InboundMessage, Teacher } from '../domain/types.js';
import { isPaperState } from '../domain/types.js';
import { EVENT } from '../domain/events.js';
import { Executor, type ExecutorDeps } from './executor.js';
import { transition } from './machine.js';
import * as msg from './messages.js';
import * as paperCopy from './paper/copy.js';

export function createInboundHandler(deps: ExecutorDeps): (message: InboundMessage) => Promise<void> {
  const executor = new Executor(deps);
  // Per handler instance (the composition root builds exactly one): tracks, per teacher id, the
  // promise for whatever inbound message is currently being processed (or queued to run next).
  // Deliberately in-memory only -- it does NOT survive a process restart. That is intentional and
  // paired with Task 9's stale-GENERATING escape (machine.ts, STALE_GENERATION_MS): a teacher
  // stuck GENERATING because the process died mid-generation recovers via the stale-inbound check
  // there, not via this map. Also deliberately per-process: this pilot runs a single instance, so
  // no cross-instance coordination is needed.
  //
  // I2: WhatsApp "send N photos" arrives as N independent webhook POSTs, so a naive "reject while
  // busy" guard (the original behaviour, still used for text-only messages and the core loop
  // below) silently DROPS alternate photos -- media never recorded, no warning, a paper grounded
  // in half the chapter. A message CARRYING MEDIA WHILE SHE IS IN A PAPER STATE instead chains
  // onto whatever is already in flight for that teacher and is processed once its turn comes,
  // instead of being discarded. Deliberately scoped to paper states: a teacher who never typed
  // PAPER and happens to send a photo while her CORE worksheet is generating must still get the
  // immediate stillWorking() bounce and must NOT be queued -- the core loop's double-text
  // behaviour is unchanged for every non-paper state, media or not (post-review fix: the original
  // `message.media.length > 0` check alone queued that case too, which is exactly the scenario
  // this isPaperState(t.state) guard closes).
  const inFlight = new Map<string, Promise<void>>();

  async function processOne(teacher: Teacher, message: InboundMessage): Promise<void> {
    const now = deps.clock.now();
    const step = transition({ teacher, message, now, joinLink: deps.joinLink, timezone: deps.timezone });
    await executor.runStep(teacher, step);
  }

  return async function handleInbound(message: InboundMessage): Promise<void> {
    let teacher: Teacher | null = null;
    try {
      const now = deps.clock.now();
      teacher = await deps.teachers.findByWaFrom(message.from);
      if (!teacher) {
        teacher = await deps.teachers.create({ waFrom: message.from, waId: message.waId, profileName: message.profileName, now });
        await deps.events.log(teacher.id, { name: EVENT.session_started, properties: { profileName: message.profileName } }, now);
      }
      const t = teacher;
      // From here to the matching inFlight.set(...) below there is deliberately no `await`, so the
      // check-then-set is atomic against a concurrent call for the same teacher (JS is
      // single-threaded; nothing can interleave between two synchronous statements).
      const running = inFlight.get(t.id);
      if (running) {
        if (message.media.length > 0 && isPaperState(t.state)) {
          // Re-fetch right before this actually runs, NOT the `t` snapshot captured above: by the
          // time the promise we are chaining onto has settled, an earlier queued photo may have
          // already updated paperRequest.media, and paperTransition computes a whole replacement
          // paperRequest object from whatever teacher it is given -- running against a stale
          // snapshot would silently stomp that earlier update instead of building on it.
          const chained = running.catch(() => {}).then(async () => {
            const latest = (await deps.teachers.findByWaFrom(message.from)) ?? t;
            return processOne(latest, message);
          });
          inFlight.set(t.id, chained);
          try {
            await chained;
          } finally {
            if (inFlight.get(t.id) === chained) inFlight.delete(t.id);
          }
          return;
        }
        await deps.events.log(t.id, { name: EVENT.still_working_sent, properties: { reason: 'in_flight' } }, now);
        const busy = t.state === 'PAPER_MEDIA' ? paperCopy.mediaBusy() : isPaperState(t.state) ? paperCopy.paperStillWorking() : msg.stillWorking();
        await deps.messenger.sendText(t.waFrom, busy);
        return;
      }
      const run = processOne(t, message);
      inFlight.set(t.id, run);
      try {
        await run;
      } finally {
        if (inFlight.get(t.id) === run) inFlight.delete(t.id);
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

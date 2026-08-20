import cron from 'node-cron';
import { Executor, type ExecutorDeps } from '../bot/executor.js';
import { buildNudgeStep } from '../bot/machine.js';
import { hasNextSkill } from '../bot/skills.js';
import { EVENT } from '../domain/events.js';
import { isPaperState } from '../domain/types.js';

/**
 * Callable exactly like `() => Promise<number>` (one sweep; returns #sent), plus `whenIdle()` so a
 * caller (shutdown) can drain an in-flight sweep without changing the call-site type -- `AppDeps`'s
 * `runNudgePass: () => Promise<number>` and `startNudgeCron`'s `runPass` param are untouched.
 */
export interface NudgePass {
  (): Promise<number>;
  /** Resolves once no sweep is in flight (immediately, with 0, if already idle). Never rejects. */
  whenIdle(): Promise<number>;
}

export function createNudgePass(deps: ExecutorDeps): NudgePass {
  const executor = new Executor(deps);
  // Closure-scoped per pass instance (mirrors Task 13's per-handler `inFlight` Set) -- deliberately
  // NOT module-level. Serializes the sweep because it is reachable from TWO uncoordinated triggers:
  // the in-process cron AND the CRON_SECRET-gated POST /internal/cron/nudges route. node-cron's
  // `noOverlap` only guards its own Runner and has no visibility into a direct call from Express, so
  // without this, both could sweep the same due-list at once and double-send.
  let running: Promise<number> | null = null;

  async function sweep(): Promise<number> {
    const now = deps.clock.now();
    const due = await deps.teachers.findNudgeDue(now);
    let sent = 0;
    for (const t of due) {
      try {
        if (!hasNextSkill(t.skillsCompleted)) {
          await deps.teachers.update(t.id, { nudgeDueAt: null });
          continue;
        }
        if (t.state !== 'IDLE') {
          if (isPaperState(t.state)) continue; // parked mid-paper-wizard: keep the nudge; it fires when she returns to IDLE
          // mid-core-conversation: don't interrupt; drop this nudge
          await deps.teachers.update(t.id, { nudgeDueAt: null });
          continue;
        }
        await executor.runStep(t, buildNudgeStep(t, now));
        sent += 1;
      } catch (err) {
        console.error(`[nudges] failed for ${t.id}`, err);
        try {
          await deps.events.log(t.id, { name: EVENT.nudge_failed, properties: { message: err instanceof Error ? err.message : String(err) } }, now);
        } catch { /* ignore */ }
      }
    }
    if (due.length > 0) console.log(`[nudges] due=${due.length} sent=${sent}`);
    return sent;
  }

  const runNudgePass = (async function runNudgePass(): Promise<number> {
    if (running) {
      console.log('[nudges] sweep already running; joining');
      return running;
    }
    const p = sweep().finally(() => {
      running = null;
    });
    running = p;
    return p;
  }) as NudgePass;

  // Never rejects: a stuck OR a failing in-flight sweep must not turn shutdown's drain
  // (`whenIdle().finally(...)`) into an unhandled rejection. Callers that want the failure signal
  // already get it from the awaited `runNudgePass()` call itself.
  runNudgePass.whenIdle = () => (running ?? Promise.resolve(0)).catch(() => 0);

  return runNudgePass;
}

export function startNudgeCron(runPass: () => Promise<number>, cronExpr: string, timezone: string): { stop: () => void } {
  if (!cron.validate(cronExpr)) throw new Error(`invalid cron expression: ${cronExpr}`);
  const task = cron.schedule(cronExpr, async () => {
    try {
      await runPass();
    } catch (err) {
      console.error('[nudges] pass failed', err);
    }
  }, { name: 'nudge-pass', timezone, noOverlap: true });
  return { stop: () => task.destroy() };
}

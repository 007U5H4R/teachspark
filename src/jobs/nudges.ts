import cron from 'node-cron';
import { Executor, type ExecutorDeps } from '../bot/executor.js';
import { buildNudgeStep } from '../bot/machine.js';
import { hasNextSkill } from '../bot/skills.js';
import { EVENT } from '../domain/events.js';

export function createNudgePass(deps: ExecutorDeps): () => Promise<number> {
  const executor = new Executor(deps);
  return async function runNudgePass(): Promise<number> {
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
          // mid-conversation: don't interrupt; drop this nudge
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
  };
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

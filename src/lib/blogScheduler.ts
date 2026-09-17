// Wires the auto-publish pipeline to a fixed daily schedule: once a day, by
// default at 03:00 UTC (~8:30am IST) — override with BLOG_GEN_HOURS_UTC, a
// comma-separated list of UTC hours (0-23) if more than one slot is wanted.
//
// Deliberately once/day, not several times/day like an earlier version of
// this — a failure (AI key missing or out of credit) used to mean up to 5
// error rows a day; once/day keeps the blast radius small while this is
// re-proven reliable, and can be widened later via the env var alone.
//
// This is a single long-running Node process (not serverless), so a plain
// setTimeout chain is enough — no external cron service needed. It
// recomputes "time until the next scheduled hour" on every fire and after
// every restart, so a redeploy never causes a double-fire or a drifted
// schedule. dbGenRun rows from the last ~90 minutes guard against firing
// twice if the process restarts twice within the same slot (e.g. a bad
// deploy that crash-loops).
import { dbEnabled, query } from './db';
import { runBlogGenCycle } from './blogPipeline';

function scheduledHours(): number[] {
  const raw = (process.env.BLOG_GEN_HOURS_UTC || (import.meta as any).env?.BLOG_GEN_HOURS_UTC || '3').trim();
  const hours = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
  return hours.length ? hours : [3];
}

function msUntilNextSlot(): number {
  const hours = scheduledHours();
  const now = new Date();
  const candidates = hours.map((h) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
  });
  return Math.min(...candidates) - now.getTime();
}

async function alreadyRanThisSlot(): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { rows } = await query('SELECT 1 FROM blog_gen_runs WHERE created_at > $1 LIMIT 1', [cutoff]);
    return rows.length > 0;
  } catch {
    return false;
  }
}

let armed = false;

function armNext(): void {
  const delay = msUntilNextSlot();
  setTimeout(async () => {
    try {
      if (!(await alreadyRanThisSlot())) {
        const result = await runBlogGenCycle();
        console.log(`blogScheduler: cycle finished — ${result.status}: ${result.detail}`);
      } else {
        console.log('blogScheduler: skipping — a run already happened in this slot (likely a restart)');
      }
    } catch (err: any) {
      console.error('blogScheduler: cycle threw unexpectedly', err?.message || err);
    }
    armNext();
  }, delay);
}

export function startBlogScheduler(): void {
  if (armed) return;
  armed = true;
  if (!dbEnabled) {
    console.log('blogScheduler: DATA_DIR not configured — auto-publish disabled until it is.');
    return;
  }
  const hours = scheduledHours();
  console.log(`blogScheduler: armed — publishing at ${hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')} UTC daily`);
  armNext();
}

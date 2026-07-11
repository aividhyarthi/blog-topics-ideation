// Self-contained nightly-check scheduler — runs inside the already-live
// website process instead of depending on an external trigger (a Railway
// Cron Job service, or a free URL-ping scheduler like cron-job.org). Those
// both depend on something outside this repo being configured correctly and
// staying that way; this doesn't — as long as the site itself is up (which
// it needs to be anyway), the check runs on its own, once a day, no extra
// setup, nothing to verify in a separate dashboard.
//
// Targets 06:00 UTC (11:30am IST) to match the schedule this project has
// documented all along. Started once, lazily, from the first real incoming
// request (see src/middleware.ts) — NOT at module import time, because
// `astro build` also loads this module, and a pending setTimeout would keep
// a build process alive until it fires.
import { runNightlyCheck } from './nightly';

let started = false;

function msUntilNextRun(hourUtc = 6, minuteUtc = 0): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minuteUtc, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function runAndLog() {
  console.log(`[nightly-scheduler] starting automatic check at ${new Date().toISOString()}`);
  try {
    const result = await runNightlyCheck(20 * 60 * 1000);
    for (const line of result.lines) console.log(`[nightly-scheduler] ${line}`);
  } catch (e) {
    console.error(`[nightly-scheduler] FAILED:`, e);
  }
}

export function startNightlyScheduler() {
  if (started) return;
  started = true;

  const armNext = () => {
    const delay = msUntilNextRun();
    console.log(`[nightly-scheduler] next automatic check at ${new Date(Date.now() + delay).toISOString()}`);
    setTimeout(async () => {
      await runAndLog();
      armNext(); // 24h later, computed fresh so it can't drift
    }, delay);
  };

  armNext();
}

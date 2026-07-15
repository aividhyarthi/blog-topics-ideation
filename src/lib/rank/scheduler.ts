// Self-contained nightly-check scheduler — runs inside the already-live
// website process instead of depending on an external trigger (a Railway
// Cron Job service, or a free URL-ping scheduler like cron-job.org). Those
// both depend on something outside this repo being configured correctly and
// staying that way; this doesn't — as long as the site itself is up (which
// it needs to be anyway), the check runs on its own, once a day, no extra
// setup, nothing to verify in a separate dashboard.
//
// Default check time is 18:30 UTC = 00:00 IST (midnight), matching the
// owner's expectation; override with NIGHTLY_CHECK_UTC="HH:MM" if it ever
// needs to move. Started once, lazily, from the first real incoming request (see
// src/middleware.ts) — NOT at module import time, because `astro build`
// also loads this module, and a pending setTimeout would keep a build
// process alive until it fires.
import { runNightlyCheck } from './nightly';
import { readNightlyStatus, writeNightlyStatus } from './run-status';

let started = false;

function checkTimeUtc(): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(process.env.NIGHTLY_CHECK_UTC || '');
  if (m) {
    const hour = Math.min(23, parseInt(m[1], 10));
    const minute = Math.min(59, parseInt(m[2], 10));
    return { hour, minute };
  }
  return { hour: 18, minute: 30 }; // 18:30 UTC = 00:00 IST
}

export function nextRunAt(now = new Date()): Date {
  const { hour, minute } = checkTimeUtc();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function schedulerInfo(): { started: boolean; nextRunAt: string; checkTimeUtc: string } {
  const { hour, minute } = checkTimeUtc();
  return {
    started,
    nextRunAt: nextRunAt().toISOString(),
    checkTimeUtc: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

async function runAndLog() {
  console.log(`[nightly-scheduler] starting automatic check at ${new Date().toISOString()}`);
  try {
    // 90 min budget: two 500-keyword coverage lists at ~1.5s/keyword is
    // already ~25 min, and this runs in-process with no HTTP timeout to
    // worry about — a roomy budget just means big lists actually finish.
    const result = await runNightlyCheck(90 * 60 * 1000, 'scheduler');
    for (const line of result.lines) console.log(`[nightly-scheduler] ${line}`);
  } catch (e) {
    console.error(`[nightly-scheduler] FAILED:`, e);
    const prev = readNightlyStatus();
    if (prev && !prev.finishedAt) {
      writeNightlyStatus({ ...prev, finishedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export function startNightlyScheduler() {
  if (started) return;
  started = true;

  const armNext = () => {
    const delay = nextRunAt().getTime() - Date.now();
    console.log(`[nightly-scheduler] next automatic check at ${new Date(Date.now() + delay).toISOString()}`);
    setTimeout(async () => {
      await runAndLog();
      armNext(); // 24h later, computed fresh so it can't drift
    }, delay);
  };

  armNext();
}

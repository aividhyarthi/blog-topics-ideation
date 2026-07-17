// Self-contained nightly-check scheduler — runs inside the already-live
// website process instead of depending on an external trigger (a Railway
// Cron Job service, or a free URL-ping scheduler like cron-job.org). Those
// both depend on something outside this repo being configured correctly and
// staying that way; this doesn't — as long as the site itself is up (which
// it needs to be anyway), the check runs on its own, no extra setup,
// nothing to verify in a separate dashboard.
//
// Retries hourly across a 12-hour window instead of firing once. A single
// once-a-day run means a crash or a mid-run restart (a Railway redeploy,
// an OOM, an unhandled rejection somewhere) silently strands whichever
// tenants hadn't been reached yet until the SAME time tomorrow — that's
// exactly what a report "just not showing up" for a day looks like from
// the outside. Hourly retries mean a bad run only costs an hour: the next
// tick picks up any tenant not yet marked done today (see nightly.ts's
// per-tenant marker) instead of waiting a full day.
//
// Window default: 18:30–06:30 UTC = 00:00–12:00 IST, matching the owner's
// expectation; override the start with NIGHTLY_CHECK_UTC="HH:MM" if it
// ever needs to move. Started once, lazily, from the first real incoming
// request (see src/middleware.ts) — NOT at module import time, because
// `astro build` also loads this module, and a pending setTimeout would
// keep a build process alive until it fires.
import { runNightlyCheck } from './nightly';
import { readNightlyStatus, writeNightlyStatus } from './run-status';

let started = false;

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS = 12;

function windowStartUtc(): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(process.env.NIGHTLY_CHECK_UTC || '');
  if (m) {
    const hour = Math.min(23, parseInt(m[1], 10));
    const minute = Math.min(59, parseInt(m[2], 10));
    return { hour, minute };
  }
  return { hour: 18, minute: 30 }; // 18:30 UTC = 00:00 IST
}

function windowStartOn(day: Date): Date {
  const { hour, minute } = windowStartUtc();
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute, 0, 0));
}

/** The start of the window `now` currently falls inside (today's or the one that began yesterday and runs past midnight UTC), or null if `now` is between windows. */
function activeWindowStart(now: Date): Date | null {
  for (const dayOffsetMs of [0, -86400000]) {
    const start = windowStartOn(new Date(now.getTime() + dayOffsetMs));
    const end = start.getTime() + WINDOW_HOURS * HOUR_MS;
    if (now.getTime() >= start.getTime() && now.getTime() <= end) return start;
  }
  return null;
}

/** Next hourly tick — inside the active window if one is running (including
 * right after a restart mid-window, so a crash resumes within the hour
 * instead of waiting for tomorrow's window), otherwise the next window's
 * start. */
export function nextRunAt(now = new Date()): Date {
  const active = activeWindowStart(now);
  if (active) {
    const elapsedTicks = Math.floor((now.getTime() - active.getTime()) / HOUR_MS);
    const next = new Date(active.getTime() + (elapsedTicks + 1) * HOUR_MS);
    if (next.getTime() <= active.getTime() + WINDOW_HOURS * HOUR_MS) return next;
    return new Date(active.getTime() + 24 * HOUR_MS); // that was the window's last tick
  }
  const todayStart = windowStartOn(now);
  return todayStart.getTime() > now.getTime() ? todayStart : new Date(todayStart.getTime() + 24 * HOUR_MS);
}

export function schedulerInfo(): { started: boolean; nextRunAt: string; windowStartUtc: string; windowHours: number } {
  const { hour, minute } = windowStartUtc();
  return {
    started,
    nextRunAt: nextRunAt().toISOString(),
    windowStartUtc: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    windowHours: WINDOW_HOURS,
  };
}

async function runAndLog() {
  console.log(`[nightly-scheduler] starting automatic check at ${new Date().toISOString()}`);
  try {
    // 20 min budget per tick: a tenant already marked done today (see
    // nightly.ts) skips straight to coverage batching, so most ticks are
    // cheap — this budget mainly bounds how much coverage-list progress one
    // tick makes, not the whole day's work (that's what the hourly retries
    // across the window are for).
    const result = await runNightlyCheck(20 * 60 * 1000, 'scheduler');
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
      armNext(); // computed fresh each time so it can't drift
    }, delay);
  };

  armNext();
}

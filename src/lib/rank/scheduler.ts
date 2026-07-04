// In-process daily scheduler for saved trackers — no external cron needed.
// Every hour, checks each saved tracker for whether it already has a run
// saved for today; if not, runs it. Idempotent by design (keyed off what's
// already on disk), so redeploys/restarts never cause double- or missed
// runs — a fresh process just resumes from "has today's file been written?".
import { listTrackers, listRunDates } from './store';
import { runTracker } from './runner';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FIRST_TICK_DELAY_MS = 15_000; // let the server finish booting first

let started = false;

async function tick(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  for (const tracker of listTrackers()) {
    if (listRunDates(tracker.id).includes(today)) continue;
    try {
      await runTracker(tracker);
    } catch (e) {
      console.error(`[rank-scheduler] tracker "${tracker.name}" (${tracker.id}) failed:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => { tick().catch(() => {}); }, FIRST_TICK_DELAY_MS);
  setInterval(() => { tick().catch(() => {}); }, CHECK_INTERVAL_MS);
}

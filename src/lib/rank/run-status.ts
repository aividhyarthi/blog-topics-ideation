// Persistent record of the last nightly-check run — written by
// runNightlyCheck (whatever triggered it: in-process scheduler, HTTP cron
// endpoint, standalone script, or the admin panel's "Run now" button) and
// read by the /admin panel, so "did the automatic check actually run?" is
// answerable from the UI instead of requiring Railway log access.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface NightlyRunStatus {
  startedAt: string;
  finishedAt: string | null; // null = still running (or crashed mid-run)
  trigger: string; // 'scheduler' | 'http-cron' | 'cli' | 'admin'
  checkedApps: number;
  checkedCoverage: number;
  lines: string[];
  error: string | null;
}

function statusPath(): string {
  const dir = process.env.RANK_DATA_DIR || join(process.cwd(), '.rank-data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'nightly-status.json');
}

export function readNightlyStatus(): NightlyRunStatus | null {
  try {
    if (!existsSync(statusPath())) return null;
    return JSON.parse(readFileSync(statusPath(), 'utf8')) as NightlyRunStatus;
  } catch { return null; }
}

export function writeNightlyStatus(status: NightlyRunStatus): void {
  try { writeFileSync(statusPath(), JSON.stringify(status, null, 2)); }
  catch { /* status is best-effort — never fail the check itself over it */ }
}

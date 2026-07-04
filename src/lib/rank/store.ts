// Saved rank trackers + their daily history. Plain JSON files on disk, same
// pattern as the WBR's week-over-week store (src/lib/wbr/store.ts) — one file
// per tracker config, one file per tracker per day it was checked.
//
// Storage location is RANK_DATA_DIR (point it at a Railway Volume mount so
// trackers + history survive redeploys). Defaults to ./.rank-data for local dev.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppLabel, CompactKeywordRankResult, CategoryRankResult, TopCompetitor } from './track';

export interface Tracker {
  id: string;
  name: string;
  primary: string; // appId
  competitors: string[]; // appIds
  keywords: string[];
  category: string | null;
  country: string;
  lang: string;
  createdAt: string;
}

export interface TrackerRun {
  date: string; // YYYY-MM-DD, one run saved per day
  ranAt: string; // ISO timestamp
  primary: AppLabel;
  competitors: AppLabel[];
  keywords: CompactKeywordRankResult[]; // raw per-keyword result lists already stripped — see compactKeywordResult
  category: CategoryRankResult | null;
  topCompetitors: TopCompetitor[];
}

function dataDir(): string {
  const dir = process.env.RANK_DATA_DIR || join(process.cwd(), '.rank-data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
function trackersDir(): string {
  const d = join(dataDir(), 'trackers');
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}
function historyDir(id: string): string {
  const d = join(dataDir(), 'history', id);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export function listTrackers(): Tracker[] {
  return readdirSync(trackersDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(readFileSync(join(trackersDir(), f), 'utf8')) as Tracker; }
      catch { return null; }
    })
    .filter((t): t is Tracker => t !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getTracker(id: string): Tracker | null {
  const p = join(trackersDir(), `${id}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as Tracker; } catch { return null; }
}

export function createTracker(input: Omit<Tracker, 'id' | 'createdAt'>): Tracker {
  const t: Tracker = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  writeFileSync(join(trackersDir(), `${t.id}.json`), JSON.stringify(t));
  return t;
}

export function deleteTracker(id: string): boolean {
  const p = join(trackersDir(), `${id}.json`);
  if (!existsSync(p)) return false;
  rmSync(p);
  const hd = join(dataDir(), 'history', id);
  if (existsSync(hd)) rmSync(hd, { recursive: true, force: true });
  return true;
}

export function saveRun(trackerId: string, run: TrackerRun): void {
  writeFileSync(join(historyDir(trackerId), `${run.date}.json`), JSON.stringify(run));
}

/** Dates this tracker has been checked, newest first. */
export function listRunDates(trackerId: string): string[] {
  const d = join(dataDir(), 'history', trackerId);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort((a, b) => (a < b ? 1 : -1));
}

export function loadRun(trackerId: string, date: string): TrackerRun | null {
  const p = join(dataDir(), 'history', trackerId, `${date}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as TrackerRun; } catch { return null; }
}

export function latestRun(trackerId: string): TrackerRun | null {
  const dates = listRunDates(trackerId);
  return dates.length ? loadRun(trackerId, dates[0]) : null;
}

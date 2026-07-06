// Rank Tracker — persistence. Two things live in RANK_DATA_DIR (point it at a
// Railway Volume so history survives redeploys; defaults to ./.rank-data):
//   config.json            — the tracked apps + their keywords
//   snap__YYYY-MM-DD.json  — one ranking snapshot per day
// Same file-per-day pattern as the WBR history store (src/lib/wbr/store.ts).
//
// Safety net: every config.json write is preceded by a timestamped backup
// (config.backup.<ISO-timestamp>.json, last 20 kept per user) so an
// accidental overwrite — e.g. a save racing a corrupt read — is always
// recoverable. See restoreConfigBackups()/listConfigBackups() below.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RankSnapshot, TrackerConfig } from './types';

/**
 * Data directory. With no `userId` (the internal single-tenant deployment)
 * everything lives at the root of RANK_DATA_DIR — unchanged from before. In
 * product mode each user gets their own subfolder: RANK_DATA_DIR/users/<id>.
 */
function dataDir(userId?: string): string {
  const root = process.env.RANK_DATA_DIR || join(process.cwd(), '.rank-data');
  const dir = userId ? join(root, 'users', userId.replace(/[^a-z0-9-]/gi, '_')) : root;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
const safe = (s: string) => s.replace(/[^a-z0-9_-]/gi, '_');
const configFile = (userId?: string) => join(dataDir(userId), 'config.json');
const snapFile = (dateKey: string, userId?: string) => join(dataDir(userId), `snap__${safe(dateKey)}.json`);
const covSnapFile = (dateKey: string, userId?: string) => join(dataDir(userId), `covsnap__${safe(dateKey)}.json`);
const MAX_BACKUPS = 20;

/**
 * Thrown when config.json exists but can't be parsed (corrupt/truncated
 * write). Distinct from "no config yet" (a brand-new user) — callers must
 * NOT treat this as "zero apps" and save over it, or the real data is lost
 * for good. Surface the error and let the user retry instead.
 */
export class ConfigReadError extends Error {}

export function loadConfig(userId?: string): TrackerConfig {
  const p = configFile(userId);
  if (!existsSync(p)) return { apps: [] };
  let raw: string;
  try { raw = readFileSync(p, 'utf8'); }
  catch (e) { throw new ConfigReadError(`Could not read your saved apps: ${e instanceof Error ? e.message : String(e)}`); }
  try {
    const cfg = JSON.parse(raw) as TrackerConfig;
    return { apps: Array.isArray(cfg.apps) ? cfg.apps : [] };
  } catch {
    throw new ConfigReadError('Your saved apps file looks corrupted. Not overwriting it — contact support to restore from backup.');
  }
}

export function saveConfig(cfg: TrackerConfig, userId?: string): void {
  const p = configFile(userId);
  // Snapshot whatever is currently on disk before overwriting, so a bad
  // write is always recoverable — even one caused by a bug we haven't
  // thought of yet.
  if (existsSync(p)) {
    try {
      const dir = dataDir(userId);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(p, join(dir, `config.backup.${stamp}.json`));
      const backups = readdirSync(dir).filter((f) => f.startsWith('config.backup.')).sort();
      for (const old of backups.slice(0, -MAX_BACKUPS)) rmSync(join(dir, old));
    } catch { /* backup is best-effort — never block the real save on it */ }
  }
  writeFileSync(p, JSON.stringify(cfg, null, 2));
}

/** List available config.json backups for this user, newest first (for support/recovery). */
export function listConfigBackups(userId?: string): string[] {
  const dir = dataDir(userId);
  return readdirSync(dir).filter((f) => f.startsWith('config.backup.')).sort().reverse();
}

/** Restore config.json from a specific backup filename (from listConfigBackups). */
export function restoreConfigBackup(filename: string, userId?: string): TrackerConfig {
  const dir = dataDir(userId);
  if (!filename.startsWith('config.backup.') || filename.includes('/')) throw new Error('Invalid backup filename.');
  const raw = readFileSync(join(dir, filename), 'utf8');
  const cfg = JSON.parse(raw) as TrackerConfig;
  saveConfig(cfg, userId);
  return cfg;
}

export function saveSnapshot(snap: RankSnapshot, userId?: string): void {
  writeFileSync(snapFile(snap.dateKey, userId), JSON.stringify(snap));
}

export function loadSnapshot(dateKey: string, userId?: string): RankSnapshot | null {
  const p = snapFile(dateKey, userId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as RankSnapshot; } catch { return null; }
}

/** All snapshots sorted oldest→newest (the shape track.ts expects). */
export function loadSnapshots(limit = 90, userId?: string): RankSnapshot[] {
  const dir = dataDir(userId);
  return readdirSync(dir)
    .filter((f) => f.startsWith('snap__') && f.endsWith('.json'))
    .sort() // filenames embed YYYY-MM-DD, so lexical sort = chronological
    .slice(-limit)
    .map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) as RankSnapshot; } catch { return null; }
    })
    .filter((s): s is RankSnapshot => s !== null);
}

export function deleteSnapshot(dateKey: string, userId?: string): boolean {
  const p = snapFile(dateKey, userId);
  if (!existsSync(p)) return false;
  rmSync(p);
  return true;
}

// --- coverage snapshots (the full keyword-universe check, on-demand, kept
// separate from the daily-tracked snapshots above so a 300-keyword coverage
// check never bloats or gets confused with the plan-limited daily history) --

export function saveCoverageSnapshot(snap: RankSnapshot, userId?: string): void {
  writeFileSync(covSnapFile(snap.dateKey, userId), JSON.stringify(snap));
}

export function loadCoverageSnapshot(dateKey: string, userId?: string): RankSnapshot | null {
  const p = covSnapFile(dateKey, userId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as RankSnapshot; } catch { return null; }
}

export function loadCoverageSnapshots(limit = 60, userId?: string): RankSnapshot[] {
  const dir = dataDir(userId);
  return readdirSync(dir)
    .filter((f) => f.startsWith('covsnap__') && f.endsWith('.json'))
    .sort()
    .slice(-limit)
    .map((f) => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf8')) as RankSnapshot; } catch { return null; }
    })
    .filter((s): s is RankSnapshot => s !== null);
}

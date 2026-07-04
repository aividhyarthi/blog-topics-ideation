// Rank Tracker — persistence. Two things live in RANK_DATA_DIR (point it at a
// Railway Volume so history survives redeploys; defaults to ./.rank-data):
//   config.json            — the tracked apps + their keywords
//   snap__YYYY-MM-DD.json  — one ranking snapshot per day
// Same file-per-day pattern as the WBR history store (src/lib/wbr/store.ts).
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
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

export function loadConfig(userId?: string): TrackerConfig {
  const p = configFile(userId);
  if (!existsSync(p)) return { apps: [] };
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf8')) as TrackerConfig;
    return { apps: Array.isArray(cfg.apps) ? cfg.apps : [] };
  } catch { return { apps: [] }; }
}

export function saveConfig(cfg: TrackerConfig, userId?: string): void {
  writeFileSync(configFile(userId), JSON.stringify(cfg, null, 2));
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

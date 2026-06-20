// Week-over-week history store for the WBR. Each generated week is saved as a
// compact JSON snapshot so the next week can be diffed against it automatically
// (the user only uploads the new week).
//
// Storage location is WBR_DATA_DIR (set a Railway Volume mount path there so
// history survives redeploys). Defaults to ./.wbr-data for local dev.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { BrandSummary } from './report';

export interface Snapshot {
  vertical: 'beauty' | 'fashion';
  weekKey: string; // YYYY-MM-DD
  savedAt: string;
  label?: string;
  // Primary (client) brand — optional for back-compat with pre-existing
  // snapshots, which were always Nykaa.
  primaryBrand?: string;
  primaryLabel?: string;
  summary: BrandSummary[];
  // primary brand's category -> total mentions (for category movement)
  categoryMentions: Record<string, number>;
  // primary brand's topic name -> snapshot metrics (for topic-level movers).
  // Field name kept as nykaaTopics for back-compat with saved history files.
  nykaaTopics: Record<string, { v: number; m: number; vol: number }>;
  gapTopics: string[]; // current gap topic names (for new/closed gaps)
  gapCount: number;
}

function dataDir(): string {
  const dir = process.env.WBR_DATA_DIR || join(process.cwd(), '.wbr-data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
const safe = (s: string) => s.replace(/[^a-z0-9_-]/gi, '_');
const fileFor = (vertical: string, weekKey: string) =>
  join(dataDir(), `${safe(vertical)}__${safe(weekKey)}.json`);

export function saveSnapshot(snap: Snapshot): void {
  writeFileSync(fileFor(snap.vertical, snap.weekKey), JSON.stringify(snap));
}

export function listSnapshots(vertical: string): { weekKey: string; savedAt: string; label?: string }[] {
  const prefix = `${safe(vertical)}__`;
  return readdirSync(dataDir())
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(dataDir(), f), 'utf8')) as Snapshot;
        return { weekKey: s.weekKey, savedAt: s.savedAt, label: s.label };
      } catch { return null; }
    })
    .filter((x): x is { weekKey: string; savedAt: string; label?: string } => x !== null)
    .sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1)); // newest first
}

export function loadSnapshot(vertical: string, weekKey: string): Snapshot | null {
  const p = fileFor(vertical, weekKey);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as Snapshot; } catch { return null; }
}

// Most recent saved week strictly before `weekKey` (the comparison baseline).
export function previousSnapshot(vertical: string, weekKey: string): Snapshot | null {
  const earlier = listSnapshots(vertical).filter((s) => s.weekKey < weekKey);
  if (!earlier.length) return null;
  return loadSnapshot(vertical, earlier[0].weekKey);
}

export function deleteSnapshot(vertical: string, weekKey: string): boolean {
  const p = fileFor(vertical, weekKey);
  if (!existsSync(p)) return false;
  rmSync(p);
  return true;
}

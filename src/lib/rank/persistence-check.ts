// Runs once at server boot in product mode. Tracked-app data disappearing on
// every redeploy has one overwhelmingly common cause: RANK_DATA_DIR isn't
// pointed at an actual Railway Volume, so it defaults to a path inside the
// container's own filesystem — which Railway wipes on every deploy. This
// makes that failure loud and immediate instead of silent.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Canary { firstBootAt: string; lastBootAt: string; bootCount: number }
const CANARY_FILE = '.persistence-canary.json';

/**
 * Returns a warning string to log loudly, or null if nothing looks wrong.
 * Also writes/updates a small canary file so the boot count accumulating
 * across deploys is visible in logs — the definitive tell for "is this
 * actually persisting" that a single boot can't determine on its own.
 */
export function checkDataPersistence(): string | null {
  const dir = process.env.RANK_DATA_DIR;
  if (!dir) {
    return (
      'RANK_DATA_DIR is not set. Tracked apps + user accounts are being written to a path ' +
      "inside this container's own filesystem, which Railway DISCARDS on every redeploy — " +
      "every user's tracked apps will vanish on the next deploy.\n" +
      'Fix: Railway -> this service -> Settings -> Volumes -> attach a Volume, note its mount ' +
      'path, then set the RANK_DATA_DIR environment variable to that exact path and redeploy.'
    );
  }

  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const p = join(dir, CANARY_FILE);
    const now = new Date().toISOString();
    let canary: Canary = { firstBootAt: now, lastBootAt: now, bootCount: 0 };
    if (existsSync(p)) {
      try { canary = JSON.parse(readFileSync(p, 'utf8')) as Canary; } catch { /* start fresh below */ }
    }
    canary.bootCount += 1;
    canary.lastBootAt = now;
    writeFileSync(p, JSON.stringify(canary));
    console.log(
      `[persistence check] RANK_DATA_DIR=${dir} · boot #${canary.bootCount} since ${canary.firstBootAt} — ` +
      (canary.bootCount > 1
        ? 'this directory survived at least one previous restart, so persistence looks correct.'
        : 'first time this directory has been seen — normal for a fresh setup. If this number ' +
          'never goes above 1 on later deploys, the Volume is not actually mounted here.'),
    );
    return null;
  } catch (e) {
    // A directory we can't write to at all is its own, more urgent problem.
    return `RANK_DATA_DIR (${dir}) could not be written to: ${e instanceof Error ? e.message : String(e)}. Check the Volume mount and permissions.`;
  }
}

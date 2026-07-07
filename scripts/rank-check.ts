// Scheduled ranking check. Wire this to a daily scheduler (Railway cron
// `0 6 * * *` → `npx tsx scripts/rank-check.ts`, with RANK_DATA_DIR on the
// shared Volume) so trends accrue without anyone opening the UI.
//
// Covers both deployments from one script:
//  - the internal single-tenant tracker (config at the root of RANK_DATA_DIR)
//  - AppRankr product users (one config per user; only users with a live
//    trial or an active subscription are checked)
// A shared search cache dedupes identical keyword searches across users.
import { loadConfig } from '../src/lib/rank/store';
import { runCheck, checkCoverage, checkRating } from '../src/lib/rank/check';
import { checkAccess } from '../src/lib/saas/plans';
import type { SearchHit } from '../src/lib/rank/fetch';

const cache = new Map<string, SearchHit[]>();
let checkedApps = 0;
let checkedCoverage = 0;

async function checkTenant(label: string, userId?: string) {
  const cfg = loadConfig(userId);
  if (!cfg.apps.length) return;
  const snap = await runCheck(cfg.apps, userId, cache);
  for (const app of snap.apps.slice(-cfg.apps.length)) {
    const ranked = app.keywords.filter((k) => k.position != null).length;
    console.log(`  [${label}] ${app.key}: ${ranked}/${app.keywords.length} keywords ranked${app.error ? ` · ${app.error}` : ''}`);
  }
  checkedApps += cfg.apps.length;

  // Cheap (no-AI) daily rating-breakdown point per app, so the 1-2★ share
  // trend has a real point every day regardless of whether the (paid,
  // AI-backed) ASO audit itself was re-run.
  for (const app of cfg.apps) {
    try { await checkRating(app, userId); }
    catch (e) { console.error(`  [${label}] ${app.key}: rating check failed: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // Coverage lists (up to 2000 keywords) run here rather than on-demand from
  // the UI — a synchronous HTTP request has no realistic chance of finishing
  // a check that large before the connection times out, but a scheduled cron
  // process has no such deadline.
  for (const app of cfg.apps) {
    if (!(app.coverageKeywords || []).length) continue;
    try {
      await checkCoverage(app, userId);
      console.log(`  [${label}] ${app.key}: coverage check done (${app.coverageKeywords!.length} keywords)`);
      checkedCoverage++;
    } catch (e) {
      console.error(`  [${label}] ${app.key}: coverage check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// Internal single-tenant workspace (no-op if it has no apps).
await checkTenant('internal');

// Product users — skip anyone whose trial ended / subscription lapsed.
try {
  const { listUsers } = await import('../src/lib/saas/db');
  for (const user of listUsers()) {
    if (!checkAccess(user.status, user.trialEndsAt).allowed) continue;
    try { await checkTenant(user.email, user.id); }
    catch (e) { console.error(`  [${user.email}] check failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
} catch (e) {
  console.error(`User database unavailable (internal-only deployment?): ${e instanceof Error ? e.message : String(e)}`);
}

console.log(checkedApps
  ? `Done — checked ${checkedApps} app(s)${checkedCoverage ? `, ${checkedCoverage} coverage list(s)` : ''}.`
  : 'Nothing to check yet.');

// Shared nightly-check logic, used by two different triggers that both need
// to do the exact same work:
//   - scripts/rank-check.ts       — a standalone process (Railway Cron Job
//                                   service), prints to the console
//   - src/pages/api/cron/rank-check.ts — an HTTP endpoint on the ALREADY
//                                   deployed website, so a simple external
//                                   URL-ping scheduler (no extra Railway
//                                   service, no volume-sharing question) can
//                                   trigger the same check
// Covers both deployments from one pass:
//  - the internal single-tenant tracker (config at the root of RANK_DATA_DIR)
//  - AppRankr product users (one config per user; only users with a live
//    trial or an active subscription are checked)
// A shared search cache dedupes identical keyword searches across users.
import { loadConfig } from './store';
import { runCheck, checkCoverage, checkRating } from './check';
import { checkAccess } from '../saas/plans';
import type { SearchHit } from './fetch';

export interface NightlyResult {
  checkedApps: number;
  checkedCoverage: number;
  lines: string[];
}

export async function runNightlyCheck(): Promise<NightlyResult> {
  const cache = new Map<string, SearchHit[]>();
  let checkedApps = 0;
  let checkedCoverage = 0;
  const lines: string[] = [];

  async function checkTenant(label: string, userId?: string) {
    const cfg = loadConfig(userId);
    if (!cfg.apps.length) return;
    const snap = await runCheck(cfg.apps, userId, cache);
    for (const app of snap.apps.slice(-cfg.apps.length)) {
      const ranked = app.keywords.filter((k) => k.position != null).length;
      lines.push(`  [${label}] ${app.key}: ${ranked}/${app.keywords.length} keywords ranked${app.error ? ` · ${app.error}` : ''}`);
    }
    checkedApps += cfg.apps.length;

    // Cheap (no-AI) daily rating-breakdown point per app, so the 1-2★ share
    // trend has a real point every day regardless of whether the (paid,
    // AI-backed) ASO audit itself was re-run.
    for (const app of cfg.apps) {
      try { await checkRating(app, userId); }
      catch (e) { lines.push(`  [${label}] ${app.key}: rating check failed: ${e instanceof Error ? e.message : String(e)}`); }
    }

    // Coverage lists (up to 2000 keywords) run here rather than on-demand
    // from the UI — a synchronous HTTP request has no realistic chance of
    // finishing a check that large before the connection times out, but a
    // scheduled process has no such deadline.
    for (const app of cfg.apps) {
      if (!(app.coverageKeywords || []).length) continue;
      try {
        await checkCoverage(app, userId);
        lines.push(`  [${label}] ${app.key}: coverage check done (${app.coverageKeywords!.length} keywords)`);
        checkedCoverage++;
      } catch (e) {
        lines.push(`  [${label}] ${app.key}: coverage check failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Internal single-tenant workspace (no-op if it has no apps).
  await checkTenant('internal');

  // Product users — skip anyone whose trial ended / subscription lapsed.
  try {
    const { listUsers } = await import('../saas/db');
    for (const user of listUsers()) {
      if (!checkAccess(user.status, user.trialEndsAt).allowed) continue;
      try { await checkTenant(user.email, user.id); }
      catch (e) { lines.push(`  [${user.email}] check failed: ${e instanceof Error ? e.message : String(e)}`); }
    }
  } catch (e) {
    lines.push(`User database unavailable (internal-only deployment?): ${e instanceof Error ? e.message : String(e)}`);
  }

  lines.push(checkedApps
    ? `Done — checked ${checkedApps} app(s)${checkedCoverage ? `, ${checkedCoverage} coverage list(s)` : ''}.`
    : 'Nothing to check yet.');

  return { checkedApps, checkedCoverage, lines };
}

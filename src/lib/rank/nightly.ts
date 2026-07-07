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
import { runCheck, checkCoverageBatch, checkRating } from './check';
import { checkAccess } from '../saas/plans';
import type { SearchHit } from './fetch';

export interface NightlyResult {
  checkedApps: number;
  checkedCoverage: number;
  lines: string[];
}

/**
 * `overallBudgetMs` bounds the WHOLE run's coverage-checking time (shared
 * across every app/user) — the standalone CLI script (a real Railway Cron
 * Job service, no HTTP connection to time out) passes something generous;
 * the HTTP cron endpoint (still just a normal request under whatever
 * timeout the reverse proxy enforces) defaults to something conservative.
 * Either way, `checkCoverageBatch` resumes from wherever a previous run
 * left off, so a coverage list too big to finish in one run just keeps
 * making progress on each subsequent trigger instead of failing outright.
 */
export async function runNightlyCheck(overallBudgetMs = 4 * 60 * 1000): Promise<NightlyResult> {
  const cache = new Map<string, SearchHit[]>();
  let checkedApps = 0;
  let checkedCoverage = 0;
  const lines: string[] = [];
  const deadline = Date.now() + overallBudgetMs;

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
    // finishing a check that large before the connection times out. Each
    // app gets a slice of whatever time budget is left for this whole run.
    for (const app of cfg.apps) {
      if (!(app.coverageKeywords || []).length) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lines.push(`  [${label}] ${app.key}: coverage check deferred — out of time this run, will continue next run.`);
        continue;
      }
      try {
        const r = await checkCoverageBatch(app, userId, Math.min(remaining, 60000));
        lines.push(`  [${label}] ${app.key}: coverage ${r.done ? 'fully checked' : 'partially checked'} (${r.totalDone}/${r.total} keywords)`);
        if (r.checkedNow > 0) checkedCoverage++;
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

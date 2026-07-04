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
import { runCheck } from '../src/lib/rank/check';
import { checkAccess } from '../src/lib/saas/plans';
import type { SearchHit } from '../src/lib/rank/fetch';

const cache = new Map<string, SearchHit[]>();
let checkedApps = 0;

async function checkTenant(label: string, userId?: string) {
  const cfg = loadConfig(userId);
  if (!cfg.apps.length) return;
  const snap = await runCheck(cfg.apps, userId, cache);
  for (const app of snap.apps.slice(-cfg.apps.length)) {
    const ranked = app.keywords.filter((k) => k.position != null).length;
    console.log(`  [${label}] ${app.key}: ${ranked}/${app.keywords.length} keywords ranked${app.error ? ` · ${app.error}` : ''}`);
  }
  checkedApps += cfg.apps.length;
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

console.log(checkedApps ? `Done — checked ${checkedApps} app(s).` : 'Nothing to check yet.');

// Scheduled ranking check — runs one full check across all tracked apps and
// saves today's snapshot. Wire this to a daily scheduler so trends accrue
// without anyone opening the UI. On Railway: add a service (or use the same
// one) with cron schedule `0 6 * * *` running `npx tsx scripts/rank-check.ts`,
// with RANK_DATA_DIR pointing at the shared Volume.
//
// Usage: npx tsx scripts/rank-check.ts
import { loadConfig } from '../src/lib/rank/store';
import { runCheck } from '../src/lib/rank/check';

const cfg = loadConfig();
if (!cfg.apps.length) {
  console.log('No tracked apps in config — add apps on /rank first.');
  process.exit(0);
}

console.log(`Checking rankings for ${cfg.apps.length} app(s)…`);
const snap = await runCheck(cfg.apps);
for (const app of snap.apps) {
  const ranked = app.keywords.filter((k) => k.position != null).length;
  const chart = app.topChart?.position != null ? ` · chart #${app.topChart.position}` : '';
  console.log(`  ${app.key}: ${ranked}/${app.keywords.length} keywords ranked${chart}${app.error ? ` · ${app.error}` : ''}`);
}
console.log(`Saved snapshot ${snap.dateKey} (${snap.checkedAt}).`);

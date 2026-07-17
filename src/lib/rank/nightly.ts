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
import { loadConfig, saveConfig, loadSnapshots, loadCoverageSnapshots, loadNightlyMarker, saveNightlyMarker } from './store';
import { runCheck, checkCoverageBatch, checkRating } from './check';
import { backfillDeveloperId } from './fetch';
import { withTenantLock } from './lock';
import { keywordTrends, overviewSeries, countsFromBuckets, universeSizeSeries, todayKey } from './track';
import { parseReportEmails, buildDailyReportEmail, buildRankAlertEmail, buildWeeklyDigestEmail, sendReportEmail } from './email';
import { writeNightlyStatus } from './run-status';
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
export async function runNightlyCheck(overallBudgetMs = 4 * 60 * 1000, trigger = 'unknown'): Promise<NightlyResult> {
  const cache = new Map<string, SearchHit[]>();
  let checkedApps = 0;
  let checkedCoverage = 0;
  const lines: string[] = [];
  const deadline = Date.now() + overallBudgetMs;
  const startedAt = new Date().toISOString();
  // Record the run as started immediately — if it crashes mid-way, the
  // status file shows startedAt with finishedAt still null, which is itself
  // useful diagnostic information on the /admin panel.
  writeNightlyStatus({ startedAt, finishedAt: null, trigger, checkedApps: 0, checkedCoverage: 0, lines: [], error: null });

  // Serialized per tenant (see lock.ts) — this whole function reads then
  // overwrites the tenant's shared snapshot files, so it must never run
  // concurrently with another trigger (a manual "Check now" click, the HTTP
  // cron endpoint, an admin "Run now") touching the SAME tenant.
  async function checkTenant(label: string, userId?: string) {
    return withTenantLock(userId || '__internal__', () => doCheckTenant(label, userId));
  }

  async function doCheckTenant(label: string, userId?: string) {
    const cfg = loadConfig(userId);
    if (!cfg.apps.length) return;

    // The scheduler now retries hourly across a window instead of running
    // once (see scheduler.ts) specifically so a crash/restart mid-run only
    // costs an hour instead of silently dropping a whole tenant's report
    // until the next day. That only helps if a tenant already fully checked
    // today doesn't get needlessly re-run (and re-hit store rate limits)
    // every single hour — this marker is what tells "done today" apart from
    // "never reached yet". It's only written after every step below
    // succeeds, so a run that dies partway through leaves no marker and
    // gets retried in full on the next tick, same as before this existed.
    const today = todayKey();
    const alreadyDoneToday = loadNightlyMarker(userId)?.dateKey === today;

    if (!alreadyDoneToday) {
      // Best-effort backfill for apps tracked before developerId existed — see
      // backfillDeveloperId's own comment. Self-heals overnight without
      // needing a manual "Check now" click.
      let backfilled = false;
      for (const a of cfg.apps) {
        try { if (await backfillDeveloperId(a)) backfilled = true; } catch { /* best-effort */ }
      }
      if (backfilled) saveConfig(cfg, userId);

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

      // Daily rank-report email — one per app with a saved recipient list,
      // sent right after that app's check above so the numbers in it are
      // today's, not yesterday's. Silently skipped per-app if no recipients
      // are set, and skipped entirely (see email.ts) if RESEND_API_KEY isn't
      // configured yet.
      // The digest fires on IST-Monday (this scheduler runs at midnight IST =
      // 18:30 UTC the previous calendar day, so the UTC day-of-week is wrong
      // for this — shift to IST before asking what day it is).
      const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
      const isIstMonday = istNow.getUTCDay() === 1;
      const istDateKey = istNow.toISOString().slice(0, 10);
      let digestSent = false;

      for (const app of cfg.apps) {
        const recipients = parseReportEmails(app.reportEmails);
        if (!recipients.length) continue;
        try {
          const snaps = loadSnapshots(8, userId);
          const days = overviewSeries(app, snaps, 8);
          const todayDay = days[days.length - 1];
          if (!todayDay) continue; // nothing checked for this app yet today
          const yesterdayDay = days.length > 1 ? days[days.length - 2] : null;
          const trends = keywordTrends(app, snaps, 8);
          const { subject, html } = buildDailyReportEmail(app, todayDay, yesterdayDay, trends);
          await sendReportEmail(recipients, subject, html);
          lines.push(`  [${label}] ${app.key}: report emailed to ${recipients.length} recipient(s).`);

          // Rank-drop alert: keywords that were inside the top N yesterday
          // and are outside it (or gone) today. Separate email from the
          // report on purpose — a subject line that says what broke.
          if (app.alertTopN) {
            const drops = trends.filter((t) =>
              t.prevPosition != null && t.prevPosition <= app.alertTopN! &&
              !t.error && (t.position == null || t.position > app.alertTopN!));
            if (drops.length) {
              const alert = buildRankAlertEmail(app, drops, app.alertTopN);
              await sendReportEmail(recipients, alert.subject, alert.html);
              lines.push(`  [${label}] ${app.key}: rank-drop alert sent (${drops.length} keyword(s) out of top ${app.alertTopN}).`);
            }
          }

          // Weekly digest, once per IST-Monday per app (lastWeeklyDigest
          // guards a second run the same day from re-sending).
          if (isIstMonday && app.lastWeeklyDigest !== istDateKey) {
            const weekAgoDay = days.length > 1 ? days[0] : null;
            const fmtDay = (dk: string) => { const d = new Date(`${dk}T00:00:00Z`); return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`; };
            const weeklyMovers = trends
              .map((t) => {
                const from = (t.history || [])[0] ?? null;
                const to = t.position;
                return { keyword: t.keyword, from, to, delta: from != null && to != null ? from - to : 0 };
              })
              .filter((m) => m.delta !== 0)
              .sort((a, b) => b.delta - a.delta);
            const covSnaps = loadCoverageSnapshots(8, userId);
            const universe = universeSizeSeries(app, covSnaps, 8);
            const digest = buildWeeklyDigestEmail(app, {
              weekStartLabel: fmtDay(weekAgoDay ? weekAgoDay.dateKey : todayDay.dateKey),
              weekEndLabel: fmtDay(todayDay.dateKey),
              visibilityNow: todayDay.visibility,
              visibilityWeekAgo: weekAgoDay ? weekAgoDay.visibility : null,
              counts: countsFromBuckets(todayDay.buckets),
              countsWeekAgo: weekAgoDay ? countsFromBuckets(weekAgoDay.buckets) : null,
              weeklyMovers,
              universeNow: universe.length ? universe[universe.length - 1].count : null,
              universeWeekAgo: universe.length > 1 ? universe[0].count : null,
            });
            await sendReportEmail(recipients, digest.subject, digest.html);
            app.lastWeeklyDigest = istDateKey;
            digestSent = true;
            lines.push(`  [${label}] ${app.key}: weekly digest emailed to ${recipients.length} recipient(s).`);
          }
        } catch (e) {
          lines.push(`  [${label}] ${app.key}: report email failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (digestSent) saveConfig(cfg, userId);
      saveNightlyMarker(today, userId);
    } else {
      lines.push(`  [${label}] daily check already completed today — skipping to coverage.`);
    }

    // Coverage lists (up to 2000 keywords) run here rather than on-demand
    // from the UI — a synchronous HTTP request has no realistic chance of
    // finishing a check that large before the connection times out. Each
    // app gets whatever time is left of the whole run's budget: a hundreds-
    // strong list takes many minutes, and slicing it thinner than that
    // (an earlier version capped each app at 60s/day) meant a big list
    // could never finish within the day it started — the snapshot resets
    // at midnight, so it permanently showed "not checked yet".
    for (const app of cfg.apps) {
      if (!(app.coverageKeywords || []).length) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lines.push(`  [${label}] ${app.key}: coverage check deferred — out of time this run, will continue next run.`);
        continue;
      }
      try {
        const r = await checkCoverageBatch(app, userId, remaining);
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

  writeNightlyStatus({
    startedAt, finishedAt: new Date().toISOString(), trigger,
    checkedApps, checkedCoverage, lines: lines.slice(-100), error: null,
  });

  return { checkedApps, checkedCoverage, lines };
}

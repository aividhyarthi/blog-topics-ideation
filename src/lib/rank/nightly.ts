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
import { loadConfig, saveConfig, loadSnapshot, loadSnapshots, loadCoverageSnapshot, loadCoverageSnapshots, saveNightlyMarker, loadReviewThemes } from './store';
import { runCheck, checkCoverageBatch, checkRating, retryFailedChart, SearchCache, newMeter } from './check';
import type { RequestMeter } from './check';
import { analyzeReviewThemes } from './themes';
import { backfillDeveloperId, backfillGenreId } from './fetch';
import { withTenantLock } from './lock';
import { keywordTrends, overviewSeries, countsFromBuckets, universeSizeSeries, todayKey, isWithinCheckWindow } from './track';
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
  const cache = new SearchCache();
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
    const fullCfg = loadConfig(userId);
    if (!fullCfg.apps.length) return;

    // Only the apps whose staggered IST window is open right now (see
    // isWithinCheckWindow). Checking a whole portfolio at once is what
    // triggers store rate-limiting, which shows up the next morning as
    // keywords that "failed" or were never checked.
    const dueApps = fullCfg.apps.filter((a) => isWithinCheckWindow(a));
    const deferred = fullCfg.apps.length - dueApps.length;
    if (deferred) {
      lines.push(`  [${label}] ${deferred} app(s) outside their check window right now — deferred to their slot.`);
    }
    if (!dueApps.length) return;
    // NOTE: `cfg.apps` is narrowed to this run's apps, but every saveConfig
    // below writes `fullCfg` — the objects in dueApps are the same
    // references, so mutations propagate, and saving the narrowed copy
    // would silently DELETE every deferred app from the config.
    const cfg = { ...fullCfg, apps: dueApps };

    // One store-request allowance per app for this tick, shared by its daily
    // check and its coverage batch so the two together stay under the cap.
    // Because the scheduler ticks hourly this is a per-hour rate limit; an
    // app with no cap set is bounded only by the run's time budget.
    const meters = new Map<string, RequestMeter>();
    for (const a of dueApps) {
      if (a.hourlyRequestCap && a.hourlyRequestCap > 0) meters.set(a.key, newMeter(a.hourlyRequestCap));
    }

    // The scheduler retries hourly across a window instead of running once
    // (see scheduler.ts) so a crash/restart mid-run only costs an hour
    // rather than silently stranding a tenant's report until tomorrow. That
    // only helps if work already finished today isn't redone (and re-hitting
    // store rate limits) every hour — so completed work is skipped.
    //
    // This is tracked PER APP, not per tenant: with staggered windows
    // (CRED 00:00-04:00, Kuvera 04:00-08:00) a tenant-level "done today"
    // marker set after the first app's window would skip every app whose
    // window opens later — they'd simply never be checked. Today's snapshot
    // is the source of truth, and an errored row doesn't count as done, so
    // a failed keyword check is retried on the next tick.
    const today = todayKey();
    const todaySnap = loadSnapshot(today, userId);
    // Done means EVERY daily keyword has a good row today, not merely one.
    // "some" left an app marked finished after a partial pass — whatever the
    // hourly request cap, a store throttle, or a mid-run restart cut off was
    // then never revisited, and those keywords sat unchecked until tomorrow.
    // A failed chart fetch deliberately doesn't count here: it's retried on
    // its own by retryFailedChart and must not force a whole re-search.
    const isDoneToday = (app: { key: string; keywords: string[] }) => {
      const row = todaySnap?.apps.find((a) => a.key === app.key);
      if (!row) return false;
      const ok = new Set(row.keywords.filter((k) => !k.error).map((k) => k.keyword));
      return app.keywords.every((kw) => ok.has(kw));
    };
    const pending = dueApps.filter((a) => !isDoneToday(a));
    const alreadyDoneToday = pending.length === 0;

    if (!alreadyDoneToday) {
      // Only the apps still owing a check this run — an app already done
      // isn't re-searched just because a sibling in the same window isn't.
      cfg.apps = pending;
      // Best-effort backfill for apps tracked before developerId existed, or
      // whose genreId never got captured (e.g. a metadata fetch that failed
      // on the day the app was added, which the add-app flow deliberately
      // tolerates rather than blocking — see resolvePrimary's caller in
      // api/rank.ts). A missing genreId isn't just a blank field: it makes
      // fetchTopChart silently compare the app against the store's OVERALL
      // Top Free chart instead of its own category — a far harder bar to
      // clear — so this self-heals overnight without needing a manual
      // remove-and-re-add.
      let backfilled = false;
      for (const a of cfg.apps) {
        try { if (await backfillDeveloperId(a)) backfilled = true; } catch { /* best-effort */ }
        try { if (await backfillGenreId(a)) backfilled = true; } catch { /* best-effort */ }
      }
      if (backfilled) saveConfig(fullCfg, userId);

      const snap = await runCheck(cfg.apps, userId, cache, meters);
      const justChecked = new Set(cfg.apps.map((a) => a.key));
      for (const app of snap.apps.filter((a) => justChecked.has(a.key))) {
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

      // Daily negative-review theme analysis (Play only) — the Trends tab's
      // "what negative reviews complain about" panel used to sit frozen at
      // whatever the owner last clicked. This costs one Anthropic call per
      // Play app per day, so it's skipped once an entry already exists for
      // today (an hourly retry tick re-entering this block, or a run that
      // already covered this app, shouldn't re-spend it).
      const reviewThemesCache = loadReviewThemes(userId);
      for (const app of cfg.apps) {
        if (app.store !== 'play') continue;
        const existing = reviewThemesCache[app.key];
        if (existing && existing.checkedAt.slice(0, 10) === today) continue;
        try { await analyzeReviewThemes(app, userId); }
        catch (e) { lines.push(`  [${label}] ${app.key}: review-theme analysis skipped: ${e instanceof Error ? e.message : String(e)}`); }
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
      if (digestSent) saveConfig(fullCfg, userId);
      saveNightlyMarker(today, userId);
    } else {
      lines.push(`  [${label}] daily check already completed today — skipping to coverage.`);
    }

    // Runs every tick regardless of the marker above — see retryFailedChart's
    // own comment for why a chart failure otherwise only got one attempt per
    // day even across the scheduler's hourly retry window.
    for (const app of dueApps) {
      try {
        if (await retryFailedChart(app, userId)) lines.push(`  [${label}] ${app.key}: chart retry succeeded.`);
      } catch { /* best-effort */ }
    }

    // Coverage lists (up to 2000 keywords) run here rather than on-demand
    // from the UI — a synchronous HTTP request has no realistic chance of
    // finishing a check that large before the connection times out. Each
    // app gets whatever time is left of the whole run's budget: a hundreds-
    // strong list takes many minutes, and slicing it thinner than that
    // (an earlier version capped each app at 60s/day) meant a big list
    // could never finish within the day it started — the snapshot resets
    // at midnight, so it permanently showed "not checked yet".
    // Budget is SHARED and was handed out first-come-first-served: the first
    // app in config order received the entire remaining budget, so whichever
    // app sat last was starved every single day. With one small list and one
    // large one that reliably produced "the small app is fine, the big app is
    // always half-checked" — and, because a partial day is re-checked from
    // scratch the next morning, a sawtooth in the coverage charts rather than
    // steady progress.
    //
    // Two changes make starvation impossible: serve the app that is FURTHEST
    // BEHIND first, and give each app an equal slice of what's left instead of
    // letting one consume it all.
    const coverageApps = dueApps.filter((a) => (a.coverageKeywords || []).length);
    if (coverageApps.length) {
      const covSnap = loadCoverageSnapshot(today, userId);
      const progressOf = (a: typeof coverageApps[number]) => {
        const total = (a.coverageKeywords || []).length;
        const row = covSnap?.apps.find((x) => x.key === a.key);
        const done = (row?.keywords || []).filter((k) => !k.error).length;
        return total ? done / total : 1;
      };
      const ordered = coverageApps
        .map((a) => ({ app: a, progress: progressOf(a) }))
        .sort((x, y) => x.progress - y.progress);

      for (let i = 0; i < ordered.length; i++) {
        const { app } = ordered[i];
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          lines.push(`  [${label}] ${app.key}: coverage deferred — out of time this run, continues next run.`);
          continue;
        }
        // Equal split of what's left across the apps still to be served. An
        // app that finishes early returns its unused time to the ones after it,
        // because `remaining` is recomputed each iteration.
        const share = Math.max(30_000, Math.floor(remaining / (ordered.length - i)));
        try {
          // `cache` is the run-wide search cache, shared with the daily check
          // above and across every app/tenant in this run — see the note in
          // checkCoverageBatch for why that is the difference between one
          // store request per keyword and one per keyword PER competitor.
          const r = await checkCoverageBatch(app, userId, Math.min(share, remaining), cache, meters.get(app.key));
          lines.push(`  [${label}] ${app.key}: coverage ${r.done ? 'fully checked' : 'partially checked'} (${r.totalDone}/${r.total} keywords)`);
          if (r.checkedNow > 0) checkedCoverage++;
        } catch (e) {
          lines.push(`  [${label}] ${app.key}: coverage check failed: ${e instanceof Error ? e.message : String(e)}`);
        }
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

  // How much duplicate store traffic the shared cache actually avoided. This
  // is the number to read when coverage looks short: a high `saved` means the
  // dedupe is working and any shortfall is time or throttling, not repeated
  // searches; `failed` rising with it means the store is rate-limiting us.
  const totalLookups = cache.requests + cache.hits;
  if (totalLookups) {
    const saved = Math.round((cache.hits / totalLookups) * 100);
    lines.push(`Store traffic: ${cache.requests} search(es) issued, ${cache.hits} served from cache (${saved}% avoided), ${cache.errors} failed.`);
  }

  writeNightlyStatus({
    startedAt, finishedAt: new Date().toISOString(), trigger,
    checkedApps, checkedCoverage, lines: lines.slice(-100), error: null,
  });

  return { checkedApps, checkedCoverage, lines };
}

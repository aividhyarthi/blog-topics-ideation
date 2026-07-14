// Rank Tracker API.
//   GET  /api/rank                 → config + trend rows built from saved snapshots
//   POST /api/rank {action: ...}   → add-app | remove-app | set-keywords |
//                                    add-keywords | discover | check
// Internal mode: behind the SITE_PASSWORD gate, single shared workspace.
// Product mode (AppRankr): middleware guarantees a logged-in user with a live
// trial/subscription; all data is scoped to that user and plan limits apply.
import type { APIRoute } from 'astro';
import { parseAppInput, fetchAppMeta } from '../../lib/rank/fetch';
import { keywordTrends, chartTrend, overviewSeries, countsFromBuckets, RANK_BUCKETS, annotationImpact, todayKey } from '../../lib/rank/track';
import { loadConfig, saveConfig, loadSnapshots, loadSnapshot, loadCoverageSnapshots, loadCoverageSnapshot, loadAsoCache, loadRatingHistory, ConfigReadError } from '../../lib/rank/store';
import { runCheck, checkOne, checkCoverageBatch } from '../../lib/rank/check';
import { discoverKeywords } from '../../lib/rank/discover';
import { fetchTrendsScores } from '../../lib/rank/trends';
import type { Annotation, TrackedApp } from '../../lib/rank/types';
import { parseKeywordsWithVolumes } from '../../lib/rank/keywords';
import { parseReportEmails } from '../../lib/rank/email';
import { randomUUID } from 'node:crypto';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

import { planOf } from '../../lib/saas/plans';
import type { APIContext } from 'astro';

// Internal (single-tenant) limits; product mode limits come from the user's plan.
const INTERNAL_LIMITS = { maxApps: 15, maxKeywordsPerApp: 60 };
// Coverage list is a flat cap independent of plan. At this size it's checked
// by the daily cron (scripts/rank-check.ts), not the on-demand button — a
// synchronous HTTP request has no realistic chance of finishing 2000 keyword
// searches before the connection times out.
const MAX_COVERAGE_KEYWORDS = 2000;

/** Who is asking, and what are they allowed? */
function tenant(locals: APIContext['locals']) {
  if (locals.productMode && locals.user) {
    const plan = planOf(locals.user.plan);
    return { userId: locals.user.id, maxApps: plan.maxApps, maxKeywords: plan.maxKeywordsPerApp };
  }
  return { userId: undefined as string | undefined, maxApps: INTERNAL_LIMITS.maxApps, maxKeywords: INTERNAL_LIMITS.maxKeywordsPerApp };
}

/**
 * Re-check an app right after its keywords change so new keywords show real
 * ranks immediately instead of sitting blank until the next scheduled check.
 * Best-effort: a store hiccup never blocks saving the keywords themselves.
 */
async function checkAfterEdit(app: TrackedApp, userId?: string): Promise<string | undefined> {
  if (!app.keywords.length) return undefined;
  try { await checkOne(app, userId); return undefined; }
  catch (e) { return `Keywords saved, but the rank check failed: ${e instanceof Error ? e.message : String(e)}`; }
}

/**
 * Once-a-day guard for the MANUAL "Check now" / "Check coverage now"
 * buttons — repeated clicks must never re-hit the live stores more than
 * once per calendar day for the same app; that's controlled here, server
 * side, not by however many times someone happens to click. Returns the
 * existing checkedAt ISO string if this app was already checked today
 * (by the cron, an edit, or an earlier manual click), else null meaning
 * it's safe to actually run the check. Keyword edits still bypass this
 * (see checkAfterEdit) — that's a genuinely new thing to check, not a
 * repeat of today's check.
 */
function alreadyCheckedToday(appKey: string, userId?: string): string | null {
  const snap = loadSnapshot(todayKey(), userId);
  const row = snap?.apps.find((a) => a.key === appKey);
  return row ? snap!.checkedAt : null;
}
/**
 * Only true once EVERY coverage keyword has a result for today — a partial
 * result (one batch in, more still to go — see checkCoverageBatch) must
 * never look like "done for today", or a big list could never finish
 * across repeated "Check coverage now" clicks in the same day.
 */
function coverageAlreadyCheckedToday(app: TrackedApp, userId?: string): string | null {
  const snap = loadCoverageSnapshot(todayKey(), userId);
  const row = snap?.apps.find((a) => a.key === app.key);
  if (!row) return null;
  const done = new Set(row.keywords.map((k) => k.keyword));
  const allDone = (app.coverageKeywords || []).every((kw) => done.has(kw));
  return allDone ? snap!.checkedAt : null;
}

/** Everything the UI needs in one payload. */
function statePayload(userId?: string) {
  const cfg = loadConfig(userId);
  const snapshots = loadSnapshots(90, userId);
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  const covSnapshots = loadCoverageSnapshots(60, userId);
  const covLatest = covSnapshots.length ? covSnapshots[covSnapshots.length - 1] : null;
  const asoCache = loadAsoCache(userId);
  const ratingHistory = loadRatingHistory(userId);
  return {
    apps: cfg.apps.map((app) => {
      const overview = overviewSeries(app, snapshots);
      const today = overview.length ? overview[overview.length - 1] : null;
      const prev = overview.length > 1 ? overview[overview.length - 2] : null;
      // A wider (unrendered) window so a ±14-day before/after impact read is
      // possible even for an annotation near the edge of the 30-day chart.
      const widerOverview = overviewSeries(app, snapshots, 60);
      const covKeywords = app.coverageKeywords || [];
      const covOverview = covKeywords.length ? overviewSeries(app, covSnapshots, 60, covKeywords) : [];
      const covToday = covOverview.length ? covOverview[covOverview.length - 1] : null;
      const covPrev = covOverview.length > 1 ? covOverview[covOverview.length - 2] : null;
      return {
        ...app,
        annotations: (app.annotations || []).map((a) => ({ ...a, impact: annotationImpact(widerOverview, a.date) })),
        trends: keywordTrends(app, snapshots),
        chart: chartTrend(app, snapshots),
        overview: {
          days: overview,
          counts: today ? countsFromBuckets(today.buckets) : null,
          prevCounts: prev ? countsFromBuckets(prev.buckets) : null,
          visibility: today?.visibility ?? null,
          prevVisibility: prev?.visibility ?? null,
        },
        coverageOverview: {
          total: covKeywords.length,
          days: covOverview,
          counts: covToday ? countsFromBuckets(covToday.buckets) : null,
          prevCounts: covPrev ? countsFromBuckets(covPrev.buckets) : null,
          lastCheckedAt: covLatest?.checkedAt || null,
        },
        // Per-keyword rows for the FULL coverage universe (not just the
        // plan-limited daily-tracked subset) — lets the owner see where every
        // keyword they care about ranks, sorted by volume, regardless of
        // whether it made the cut into the daily-tracked list.
        coverageTrends: covKeywords.length ? keywordTrends(app, covSnapshots, 60, covKeywords) : [],
        asoCache: asoCache[app.key] || null,
        ratingHistory: ratingHistory[app.key] || [],
        latestResult: latest?.apps.find((a) => a.key === app.key) || null,
      };
    }),
    buckets: RANK_BUCKETS.map((b) => b.label),
    lastCheckedAt: latest?.checkedAt || null,
    snapshotDays: snapshots.map((s) => s.dateKey),
  };
}

export const GET: APIRoute = async ({ locals }) => {
  try { return json(statePayload(tenant(locals).userId)); }
  catch (e) {
    if (e instanceof ConfigReadError) return json({ error: e.message }, 500);
    throw e;
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');
  const { userId, maxApps, maxKeywords } = tenant(locals);
  let cfg;
  try { cfg = loadConfig(userId); }
  catch (e) {
    // Never let a read failure fall through to a save — that's exactly how a
    // corrupt file turns into a permanently empty one. Surface it instead.
    if (e instanceof ConfigReadError) return json({ error: e.message }, 500);
    throw e;
  }

  if (action === 'add-app') {
    const parsed = parseAppInput(String(body.app || ''));
    if (!parsed) {
      return json({ error: 'Paste a Google Play URL / package id (com.example.app) or an App Store URL / numeric id (id310633997).' }, 400);
    }
    const country = (String(body.country || parsed.country || 'us').trim() || 'us').toLowerCase();
    const lang = (String(body.lang || 'en').trim() || 'en').toLowerCase();
    const key = `${parsed.store}:${parsed.appId}:${country}`;
    if (cfg.apps.some((a) => a.key === key)) return json({ error: 'That app + country is already tracked.' }, 400);
    if (cfg.apps.length >= maxApps) return json({ error: `Your plan tracks up to ${maxApps} apps — remove one first or upgrade.` }, 400);

    // Metadata fetch is best-effort: if the store is unreachable right now the
    // app is still added (title falls back to the id) and ranks come later.
    let meta = null;
    let metaError: string | undefined;
    try { meta = await fetchAppMeta(parsed.store, parsed.appId, country, lang); }
    catch (e) { metaError = e instanceof Error ? e.message : String(e); }

    // Parsed once uncapped just to detect + report truncation — this box is
    // the daily-tracked list (checked automatically, capped by plan); a
    // paste bigger than the cap silently lost everything past it before,
    // with no indication anything was dropped.
    const totalParsed = parseKeywordsWithVolumes(body.keywords, Infinity).keywords.length;
    const parsedKw = parseKeywordsWithVolumes(body.keywords, maxKeywords);
    const app: TrackedApp = {
      key, store: parsed.store, appId: meta?.appId || parsed.appId, country, lang,
      title: meta?.title || parsed.appId,
      developer: meta?.developer || null,
      icon: meta?.icon || null,
      url: meta?.url || null,
      genreId: meta?.genreId || null,
      keywords: parsedKw.keywords,
      keywordVolumes: parsedKw.volumes,
      addedAt: new Date().toISOString(),
    };
    cfg.apps.push(app);
    saveConfig(cfg, userId);
    const checkError = metaError ? undefined : await checkAfterEdit(app, userId);
    const keywordsTruncated = totalParsed > parsedKw.keywords.length
      ? { saved: parsedKw.keywords.length, total: totalParsed } : null;
    return json({ ok: true, metaError, checkError, keywordsTruncated, ...statePayload(userId) });
  }

  if (action === 'remove-app') {
    const key = String(body.key || '');
    const before = cfg.apps.length;
    cfg.apps = cfg.apps.filter((a) => a.key !== key);
    if (cfg.apps.length === before) return json({ error: 'App not found.' }, 404);
    saveConfig(cfg, userId);
    return json({ ok: true, ...statePayload(userId) });
  }

  if (action === 'set-keywords' || action === 'add-keywords') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    // Only meaningful for a full replace — 'add-keywords' (the Discovery
    // "track selected" flow) already reports its own more precise
    // before/after count client-side, which correctly excludes keywords
    // skipped for already being tracked (not truncated by the cap).
    const totalParsed = action === 'set-keywords' ? parseKeywordsWithVolumes(body.keywords, Infinity).keywords.length : 0;
    const incoming = parseKeywordsWithVolumes(body.keywords, maxKeywords);
    app.keywords = action === 'add-keywords'
      ? [...app.keywords, ...incoming.keywords.filter((k) => !app.keywords.includes(k))].slice(0, maxKeywords)
      : incoming.keywords;
    app.keywordVolumes = { ...(app.keywordVolumes || {}), ...incoming.volumes };
    saveConfig(cfg, userId);
    const checkError = await checkAfterEdit(app, userId);
    const keywordsTruncated = action === 'set-keywords' && totalParsed > app.keywords.length
      ? { saved: app.keywords.length, total: totalParsed } : null;
    return json({ ok: true, checkError, keywordsTruncated, ...statePayload(userId) });
  }

  if (action === 'discover') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    // The user's OTHER tracked apps in the same store+country are treated as
    // the competitor set — their listings get mined for candidates too.
    const siblings = cfg.apps.filter((a) => a.key !== app.key && a.store === app.store && a.country === app.country);
    try {
      const result = await discoverKeywords(app, 120, siblings);
      return json({ ok: true, discovery: result });
    } catch (e) {
      return json({ error: `Discovery failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (action === 'estimate-volumes') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    const volumes = app.keywordVolumes || {};
    const all = [...new Set([...app.keywords, ...(app.coverageKeywords || [])].map((k) => k.toLowerCase()))];
    const missing = all.filter((k) => volumes[k] == null);
    if (!missing.length) return json({ ok: true, note: 'Every keyword already has a volume.', ...statePayload(userId) });
    // ~3 requests + politeness delay per keyword against an unofficial
    // endpoint — cap per call so the HTTP request finishes well inside any
    // proxy timeout; the button just gets clicked again for the rest.
    const batch = missing.slice(0, 25);
    const scores = await fetchTrendsScores(batch, app.country.toUpperCase());
    let filled = 0;
    for (const [kw, s] of scores) if (s != null) { volumes[kw] = s; filled++; }
    app.keywordVolumes = volumes;
    saveConfig(cfg, userId);
    const left = missing.length - batch.length;
    const note = filled === 0
      ? 'No estimates came back this run — the free Trends source is best-effort and sometimes blocks requests. Try again in a few minutes.'
      : `Estimated ${filled} of ${batch.length} keywords (Google Trends 0-100 popularity proxy).${left > 0 ? ` ${left} keywords still missing — click again to continue.` : ''}`;
    return json({ ok: true, note, ...statePayload(userId) });
  }

  if (action === 'set-coverage-keywords') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    const parsedCov = parseKeywordsWithVolumes(body.keywords, MAX_COVERAGE_KEYWORDS);
    app.coverageKeywords = parsedCov.keywords;
    app.keywordVolumes = { ...(app.keywordVolumes || {}), ...parsedCov.volumes };
    saveConfig(cfg, userId);
    return json({ ok: true, ...statePayload(userId) });
  }

  if (action === 'set-report-emails') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    const raw = String(body.reportEmails || '').trim();
    const valid = parseReportEmails(raw);
    if (raw && !valid.length) return json({ error: 'That doesn\'t look like a valid email address.' }, 400);
    app.reportEmails = valid.join(', ');
    saveConfig(cfg, userId);
    return json({ ok: true, ...statePayload(userId) });
  }

  if (action === 'check-coverage') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    if (!(app.coverageKeywords || []).length) return json({ error: 'Save a coverage keyword list first.' }, 400);
    const already = coverageAlreadyCheckedToday(app, userId);
    if (already) {
      return json({ ok: true, note: `Coverage was already checked today (${new Date(already).toLocaleString()}) — the next automatic check runs tonight.`, ...statePayload(userId) });
    }
    // One time-bounded batch per call (well under any browser/proxy
    // timeout) — the client calls this repeatedly, showing progress, until
    // `coverageProgress.done` comes back true. This is what makes a
    // hundreds-strong coverage list actually finish instead of the whole
    // request timing out silently.
    let progress;
    try { progress = await checkCoverageBatch(app, userId, 20000); }
    catch (e) { return json({ error: `Coverage check failed: ${e instanceof Error ? e.message : String(e)}` }, 502); }
    return json({ ok: true, coverageProgress: progress, ...statePayload(userId) });
  }

  if (action === 'add-annotation') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    const date = String(body.date || '').trim();
    if (Number.isNaN(Date.parse(date))) return json({ error: 'Enter a valid date.' }, 400);
    const type = body.type === 'paid' ? 'paid' : 'experiment';
    const label = String(body.label || '').trim().slice(0, 200);
    if (!label) return json({ error: 'Describe what you changed (or the paid push you ran).' }, 400);
    const annotation: Annotation = { id: randomUUID(), date, type, label };
    app.annotations = [...(app.annotations || []), annotation];
    saveConfig(cfg, userId);
    return json({ ok: true, ...statePayload(userId) });
  }

  if (action === 'remove-annotation') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    app.annotations = (app.annotations || []).filter((a) => a.id !== String(body.id || ''));
    saveConfig(cfg, userId);
    return json({ ok: true, ...statePayload(userId) });
  }

  if (action === 'check') {
    const key = body.key ? String(body.key) : null;
    const targets = key ? cfg.apps.filter((a) => a.key === key) : cfg.apps;
    if (!targets.length) return json({ error: key ? 'App not found.' : 'No apps tracked yet — add one first.' }, 400);

    if (key) {
      const already = alreadyCheckedToday(targets[0].key, userId);
      if (already) {
        return json({ ok: true, note: `Already checked today (${new Date(already).toLocaleString()}) — the next automatic check runs tonight.`, ...statePayload(userId) });
      }
      try { await checkOne(targets[0], userId); }
      catch (e) { return json({ error: `Check failed: ${e instanceof Error ? e.message : String(e)}` }, 502); }
      return json({ ok: true, ...statePayload(userId) });
    }

    // "Check all" only re-checks apps NOT already checked today; already-done
    // ones are silently skipped (not an error) so this button is always safe
    // to click without doubling up on live store hits for the whole day.
    const due = targets.filter((a) => !alreadyCheckedToday(a.key, userId));
    if (!due.length) {
      return json({ ok: true, note: 'Every app was already checked today — the next automatic check runs tonight.', ...statePayload(userId) });
    }
    try { await runCheck(due, userId); }
    catch (e) { return json({ error: `Check failed: ${e instanceof Error ? e.message : String(e)}` }, 502); }
    const skipped = targets.length - due.length;
    return json({ ok: true, note: skipped ? `Checked ${due.length} app(s) — ${skipped} already checked today were skipped.` : undefined, ...statePayload(userId) });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};

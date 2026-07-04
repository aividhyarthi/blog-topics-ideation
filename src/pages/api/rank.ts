// Rank Tracker API.
//   GET  /api/rank                 → config + trend rows built from saved snapshots
//   POST /api/rank {action: ...}   → add-app | remove-app | set-keywords |
//                                    add-keywords | discover | check
// Internal mode: behind the SITE_PASSWORD gate, single shared workspace.
// Product mode (AppRankr): middleware guarantees a logged-in user with a live
// trial/subscription; all data is scoped to that user and plan limits apply.
import type { APIRoute } from 'astro';
import { parseAppInput, fetchAppMeta } from '../../lib/rank/fetch';
import { keywordTrends, chartTrend, overviewSeries, countsFromBuckets, RANK_BUCKETS } from '../../lib/rank/track';
import { loadConfig, saveConfig, loadSnapshots } from '../../lib/rank/store';
import { runCheck, checkOne } from '../../lib/rank/check';
import { discoverKeywords } from '../../lib/rank/discover';
import type { TrackedApp } from '../../lib/rank/types';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

import { planOf } from '../../lib/saas/plans';
import type { APIContext } from 'astro';

// Internal (single-tenant) limits; product mode limits come from the user's plan.
const INTERNAL_LIMITS = { maxApps: 15, maxKeywordsPerApp: 60 };

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

function parseKeywords(blob: unknown, max: number): string[] {
  return String(blob || '')
    .split(/[\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, max);
}

/** Everything the UI needs in one payload. */
function statePayload(userId?: string) {
  const cfg = loadConfig(userId);
  const snapshots = loadSnapshots(90, userId);
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  return {
    apps: cfg.apps.map((app) => {
      const overview = overviewSeries(app, snapshots);
      const today = overview.length ? overview[overview.length - 1] : null;
      const prev = overview.length > 1 ? overview[overview.length - 2] : null;
      return {
        ...app,
        trends: keywordTrends(app, snapshots),
        chart: chartTrend(app, snapshots),
        overview: {
          days: overview,
          counts: today ? countsFromBuckets(today.buckets) : null,
          prevCounts: prev ? countsFromBuckets(prev.buckets) : null,
          visibility: today?.visibility ?? null,
          prevVisibility: prev?.visibility ?? null,
        },
        latestResult: latest?.apps.find((a) => a.key === app.key) || null,
      };
    }),
    buckets: RANK_BUCKETS.map((b) => b.label),
    lastCheckedAt: latest?.checkedAt || null,
    snapshotDays: snapshots.map((s) => s.dateKey),
  };
}

export const GET: APIRoute = async ({ locals }) => json(statePayload(tenant(locals).userId));

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');
  const { userId, maxApps, maxKeywords } = tenant(locals);
  const cfg = loadConfig(userId);

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

    const app: TrackedApp = {
      key, store: parsed.store, appId: meta?.appId || parsed.appId, country, lang,
      title: meta?.title || parsed.appId,
      developer: meta?.developer || null,
      icon: meta?.icon || null,
      url: meta?.url || null,
      genreId: meta?.genreId || null,
      keywords: parseKeywords(body.keywords, maxKeywords),
      addedAt: new Date().toISOString(),
    };
    cfg.apps.push(app);
    saveConfig(cfg, userId);
    const checkError = metaError ? undefined : await checkAfterEdit(app, userId);
    return json({ ok: true, metaError, checkError, ...statePayload(userId) });
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
    const incoming = parseKeywords(body.keywords, maxKeywords);
    app.keywords = action === 'add-keywords'
      ? [...app.keywords, ...incoming.filter((k) => !app.keywords.includes(k))].slice(0, maxKeywords)
      : incoming;
    saveConfig(cfg, userId);
    const checkError = await checkAfterEdit(app, userId);
    return json({ ok: true, checkError, ...statePayload(userId) });
  }

  if (action === 'discover') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    try {
      const result = await discoverKeywords(app);
      return json({ ok: true, discovery: result });
    } catch (e) {
      return json({ error: `Discovery failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (action === 'check') {
    const key = body.key ? String(body.key) : null;
    const targets = key ? cfg.apps.filter((a) => a.key === key) : cfg.apps;
    if (!targets.length) return json({ error: key ? 'App not found.' : 'No apps tracked yet — add one first.' }, 400);
    try {
      if (key) await checkOne(targets[0], userId); // single-app re-check merges into today's snapshot
      else await runCheck(targets, userId);
    } catch (e) {
      return json({ error: `Check failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
    return json({ ok: true, ...statePayload(userId) });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};

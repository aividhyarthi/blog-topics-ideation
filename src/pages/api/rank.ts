// Rank Tracker API.
//   GET  /api/rank                 → config + trend rows built from saved snapshots
//   POST /api/rank {action: ...}   → add-app | remove-app | set-keywords | check
// Sits behind the same SITE_PASSWORD gate as the rest of the site (middleware).
import type { APIRoute } from 'astro';
import { parseAppInput, fetchAppMeta } from '../../lib/rank/fetch';
import { keywordTrends, chartTrend } from '../../lib/rank/track';
import { loadConfig, saveConfig, loadSnapshots } from '../../lib/rank/store';
import { runCheck, checkApp } from '../../lib/rank/check';
import { mergeIntoSnapshot, todayKey } from '../../lib/rank/track';
import { loadSnapshot, saveSnapshot } from '../../lib/rank/store';
import type { TrackedApp } from '../../lib/rank/types';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const MAX_APPS = 15;
const MAX_KEYWORDS = 25;

function parseKeywords(blob: unknown): string[] {
  return String(blob || '')
    .split(/[\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, MAX_KEYWORDS);
}

/** Everything the UI needs in one payload. */
function statePayload() {
  const cfg = loadConfig();
  const snapshots = loadSnapshots();
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
  return {
    apps: cfg.apps.map((app) => ({
      ...app,
      trends: keywordTrends(app, snapshots),
      chart: chartTrend(app, snapshots),
      latestResult: latest?.apps.find((a) => a.key === app.key) || null,
    })),
    lastCheckedAt: latest?.checkedAt || null,
    snapshotDays: snapshots.map((s) => s.dateKey),
  };
}

export const GET: APIRoute = async () => json(statePayload());

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, any>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const action = String(body.action || '');
  const cfg = loadConfig();

  if (action === 'add-app') {
    const parsed = parseAppInput(String(body.app || ''));
    if (!parsed) {
      return json({ error: 'Paste a Google Play URL / package id (com.example.app) or an App Store URL / numeric id (id310633997).' }, 400);
    }
    const country = (String(body.country || parsed.country || 'us').trim() || 'us').toLowerCase();
    const lang = (String(body.lang || 'en').trim() || 'en').toLowerCase();
    const key = `${parsed.store}:${parsed.appId}:${country}`;
    if (cfg.apps.some((a) => a.key === key)) return json({ error: 'That app + country is already tracked.' }, 400);
    if (cfg.apps.length >= MAX_APPS) return json({ error: `Limit of ${MAX_APPS} tracked apps reached — remove one first.` }, 400);

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
      keywords: parseKeywords(body.keywords),
      addedAt: new Date().toISOString(),
    };
    cfg.apps.push(app);
    saveConfig(cfg);
    return json({ ok: true, metaError, ...statePayload() });
  }

  if (action === 'remove-app') {
    const key = String(body.key || '');
    const before = cfg.apps.length;
    cfg.apps = cfg.apps.filter((a) => a.key !== key);
    if (cfg.apps.length === before) return json({ error: 'App not found.' }, 404);
    saveConfig(cfg);
    return json({ ok: true, ...statePayload() });
  }

  if (action === 'set-keywords') {
    const app = cfg.apps.find((a) => a.key === String(body.key || ''));
    if (!app) return json({ error: 'App not found.' }, 404);
    app.keywords = parseKeywords(body.keywords);
    saveConfig(cfg);
    return json({ ok: true, ...statePayload() });
  }

  if (action === 'check') {
    const key = body.key ? String(body.key) : null;
    const targets = key ? cfg.apps.filter((a) => a.key === key) : cfg.apps;
    if (!targets.length) return json({ error: key ? 'App not found.' : 'No apps tracked yet — add one first.' }, 400);
    try {
      if (key) {
        // Single-app re-check: merge just this app into today's snapshot.
        const result = await checkApp(targets[0]);
        const dateKey = todayKey();
        saveSnapshot(mergeIntoSnapshot(loadSnapshot(dateKey), dateKey, [result]));
      } else {
        await runCheck(targets);
      }
    } catch (e) {
      return json({ error: `Check failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
    return json({ ok: true, ...statePayload() });
  }

  return json({ error: `Unknown action "${action}".` }, 400);
};

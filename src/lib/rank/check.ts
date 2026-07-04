// Rank Tracker — check runner. Runs one full ranking check across tracked
// apps and persists it into today's snapshot. Used by both the /api/rank
// endpoint ("Check now") and scripts/rank-check.ts (scheduled daily runs).
import { searchStore, searchDepth, fetchTopChart, fetchAppMeta } from './fetch';
import { keywordRank, mergeIntoSnapshot, todayKey } from './track';
import { loadSnapshot, saveSnapshot } from './store';
import type { AppRankResult, RankSnapshot, TrackedApp } from './types';
import type { SearchHit } from './fetch';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Check one app: every keyword's search position + the top-chart position.
 * `searchCache` dedupes identical (store,keyword,country,lang) searches when
 * several tracked apps share keywords. Individual keyword failures are
 * recorded per-row, never fatal.
 */
export async function checkApp(
  app: TrackedApp,
  searchCache: Map<string, SearchHit[]> = new Map(),
  delayMs = 400,
): Promise<AppRankResult> {
  const result: AppRankResult = {
    key: app.key, store: app.store, appId: app.appId, country: app.country,
    keywords: [], topChart: null, score: null, ratings: null,
  };
  const depth = searchDepth(app.store);

  for (const kw of app.keywords) {
    const cacheKey = `${app.store}|${app.country}|${app.lang}|${kw.toLowerCase()}`;
    try {
      let hits = searchCache.get(cacheKey);
      if (!hits) {
        hits = await searchStore(app.store, kw, app.country, app.lang);
        searchCache.set(cacheKey, hits);
        await sleep(delayMs); // stay polite with the store endpoints
      }
      result.keywords.push(keywordRank(app.appId, kw, hits, depth));
    } catch (e) {
      result.keywords.push({
        keyword: kw, position: null, depth, top: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    const { chart, ids } = await fetchTopChart(app.store, app.country, app.lang, app.genreId);
    const idx = ids.indexOf(app.appId);
    result.topChart = { position: idx === -1 ? null : idx + 1, chart, depth: ids.length };
  } catch (e) {
    result.error = `Top chart unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Rating/review counts recorded alongside ranks as outcome context.
  try {
    const meta = await fetchAppMeta(app.store, app.appId, app.country, app.lang);
    result.score = meta.score;
    result.ratings = meta.ratings;
  } catch { /* context only — skip silently */ }

  return result;
}

/** Check a single app and merge the result into today's snapshot. */
export async function checkOne(app: TrackedApp, userId?: string): Promise<AppRankResult> {
  const result = await checkApp(app);
  const dateKey = todayKey();
  saveSnapshot(mergeIntoSnapshot(loadSnapshot(dateKey, userId), dateKey, [result]), userId);
  return result;
}

/** Run a check for the given apps and merge the results into today's snapshot. */
export async function runCheck(apps: TrackedApp[], userId?: string, cache = new Map<string, SearchHit[]>()): Promise<RankSnapshot> {
  const results: AppRankResult[] = [];
  for (const app of apps) results.push(await checkApp(app, cache));
  const dateKey = todayKey();
  const snap = mergeIntoSnapshot(loadSnapshot(dateKey, userId), dateKey, results);
  saveSnapshot(snap, userId);
  return snap;
}

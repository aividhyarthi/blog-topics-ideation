// Rank Tracker — check runner. Runs one full ranking check across tracked
// apps and persists it into today's snapshot. Used by both the /api/rank
// endpoint ("Check now") and scripts/rank-check.ts (scheduled daily runs).
import { searchStore, searchDepth, fetchTopChart, fetchAppMeta } from './fetch';
import { keywordRank, mergeIntoSnapshot, todayKey } from './track';
import { loadSnapshot, saveSnapshot, loadCoverageSnapshot, saveCoverageSnapshot, appendRatingHistory } from './store';
import { fetchRecentReviews } from '../aso/fetch';
import { ratingDistribution } from '../aso/audit';
import type { AppRankResult, KeywordRank, RankSnapshot, TrackedApp } from './types';
import type { SearchHit } from './fetch';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Searches `keywordList` in order, stopping early once `timeBudgetMs` has
 * elapsed. `exhausted: false` means there's more of `keywordList` left
 * un-searched when time ran out — the caller decides what "more" means
 * (another batch, tomorrow, etc.). Extracted so a request-driven check
 * (bounded by how long an HTTP connection realistically survives) can make
 * steady, safely-sized progress on a very large list instead of requiring
 * one all-or-nothing multi-minute request that a browser or reverse proxy
 * will kill before it finishes — which is exactly what happens today for a
 * coverage list in the hundreds: the "Check coverage now" click just looks
 * broken, because it never gets the chance to finish and save anything.
 */
async function checkKeywordsBounded(
  app: TrackedApp,
  keywordList: string[],
  searchCache: Map<string, SearchHit[]>,
  delayMs: number,
  timeBudgetMs: number,
): Promise<{ rows: KeywordRank[]; exhausted: boolean }> {
  const rows: KeywordRank[] = [];
  const depth = searchDepth(app.store);
  const start = Date.now();
  // A run of consecutive failures almost always means the store has started
  // rate-limiting us, not that these specific keywords are broken — keep
  // going and every remaining keyword burns as an "err" row. Back off after
  // each error, and abandon the batch entirely after several in a row;
  // errored keywords are NOT treated as done (see checkCoverageBatch), so
  // they're retried by the next batch/run once the throttle clears.
  let consecutiveErrors = 0;
  for (const kw of keywordList) {
    if (Date.now() - start > timeBudgetMs) return { rows, exhausted: false };
    const cacheKey = `${app.store}|${app.country}|${app.lang}|${kw.toLowerCase()}`;
    try {
      let hits = searchCache.get(cacheKey);
      if (!hits) {
        hits = await searchStore(app.store, kw, app.country, app.lang);
        searchCache.set(cacheKey, hits);
        await sleep(delayMs); // stay polite with the store endpoints
      }
      rows.push(keywordRank(app.appId, kw, hits, depth));
      consecutiveErrors = 0;
    } catch (e) {
      rows.push({ keyword: kw, position: null, depth, top: [], error: e instanceof Error ? e.message : String(e) });
      consecutiveErrors++;
      if (consecutiveErrors >= 8) return { rows, exhausted: false };
      await sleep(delayMs * 4); // errors usually mean throttling — slow down
    }
  }
  return { rows, exhausted: true };
}

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
  keywordList: string[] = app.keywords,
): Promise<AppRankResult> {
  const result: AppRankResult = {
    key: app.key, store: app.store, appId: app.appId, country: app.country,
    keywords: [], topChart: null, score: null, ratings: null,
  };
  const depth = searchDepth(app.store);

  for (const kw of keywordList) {
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

export interface CoverageBatchResult {
  checkedNow: number; // keywords actually searched in this call
  totalDone: number; // keywords done today so far, including previous batches
  total: number; // full coverage list size
  done: boolean; // whether every keyword in the list has been checked today
}

/**
 * Check the app's full coverage-keyword universe (up to 2000, vs the
 * plan-limited `keywords`), one time-bounded batch at a time, resuming from
 * wherever today's coverage check last left off. This is what makes "Check
 * coverage now" actually work for a list in the hundreds: a single call
 * only spends up to `timeBudgetMs` searching (comfortably under any
 * browser/proxy timeout), saves whatever it finished, and reports how much
 * is left — the caller (the button handler, or the nightly cron) just
 * calls this again to pick up where it stopped. Already-done keywords for
 * today are detected from today's saved coverage snapshot, so calling this
 * repeatedly is always safe and never re-searches the same keyword twice
 * in one day.
 */
export async function checkCoverageBatch(app: TrackedApp, userId?: string, timeBudgetMs = 20000): Promise<CoverageBatchResult> {
  const list = app.coverageKeywords || [];
  const dateKey = todayKey();
  const existingSnap = loadCoverageSnapshot(dateKey, userId);
  const existingRow = existingSnap?.apps.find((a) => a.key === app.key) || null;
  // Rows that errored (usually store rate-limiting) do NOT count as done —
  // they get retried by the next batch/run, once the throttle has cleared.
  const doneSet = new Set((existingRow?.keywords || []).filter((k) => !k.error).map((k) => k.keyword));
  const remaining = list.filter((kw) => !doneSet.has(kw));

  if (!remaining.length) {
    return { checkedNow: 0, totalDone: list.length, total: list.length, done: true };
  }

  const { rows, exhausted } = await checkKeywordsBounded(app, remaining, new Map(), 400, timeBudgetMs);
  // A retried keyword replaces its previous (errored) row rather than
  // duplicating it.
  const rechecked = new Set(rows.map((r) => r.keyword));
  const mergedKeywords = [...(existingRow?.keywords || []).filter((k) => !rechecked.has(k.keyword)), ...rows];
  const result: AppRankResult = {
    key: app.key, store: app.store, appId: app.appId, country: app.country,
    keywords: mergedKeywords,
    topChart: existingRow?.topChart ?? null,
    score: existingRow?.score ?? null,
    ratings: existingRow?.ratings ?? null,
  };

  // Top-chart position + listing meta are single calls, not per-keyword —
  // only fetch them on the first batch of the day, not every follow-up one.
  if (!existingRow) {
    try {
      const { chart, ids } = await fetchTopChart(app.store, app.country, app.lang, app.genreId);
      const idx = ids.indexOf(app.appId);
      result.topChart = { position: idx === -1 ? null : idx + 1, chart, depth: ids.length };
    } catch { /* best-effort */ }
    try {
      const meta = await fetchAppMeta(app.store, app.appId, app.country, app.lang);
      result.score = meta.score;
      result.ratings = meta.ratings;
    } catch { /* best-effort */ }
  }

  saveCoverageSnapshot(mergeIntoSnapshot(existingSnap, dateKey, [result]), userId);
  const totalDone = mergedKeywords.length;
  return { checkedNow: rows.length, totalDone, total: list.length, done: exhausted && totalDone >= list.length };
}

/**
 * One day's rating-breakdown point (1-2★ share) for the nightly cron. Cheap
 * and network-only — no Anthropic call — so it can run for every tracked
 * Play Store app daily without touching the ASO audit's paid AI budget,
 * building the "1-2★ share over time" trend shown in the dashboard.
 */
export async function checkRating(app: TrackedApp, userId?: string): Promise<void> {
  if (app.store !== 'play') return; // rating breakdown proxy is Play-only today
  const { reviews, windowDays } = await fetchRecentReviews(app.appId, app.lang, app.country);
  // windowDays is the ACTUAL adaptive span fetchRecentReviews had to page
  // through to collect enough reviews (see its own doc comment) — passing it
  // through keeps this consistent with the ASO Inspector's own rating
  // breakdown, instead of silently defaulting to ratingDistribution's
  // hardcoded 28-day label regardless of the real span fetched.
  const rb = ratingDistribution(reviews, windowDays);
  appendRatingHistory(app.key, { dateKey: todayKey(), total: rb.total, negativeShare: rb.negativeShare, tone: rb.tone, windowDays: rb.windowDays }, userId);
}

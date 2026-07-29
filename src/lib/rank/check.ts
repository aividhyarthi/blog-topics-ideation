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
 * One nightly run shares a single search cache across every app and tenant
 * (see runNightlyCheck), which is what makes competitors nearly free — but an
 * unbounded Map of 2000-keyword result lists per tenant would grow all run.
 * Well past any realistic single run's working set, and dropping the whole
 * cache only costs re-fetches, never correctness.
 */
const MAX_CACHE_ENTRIES = 8000;

/**
 * Key for one cached store search. Deliberately keyed on the SEARCH, not on
 * the app asking for it: the Play/App Store results for a keyword in a given
 * storefront are identical no matter which tracked app we're locating inside
 * them, so two apps (a primary and its competitor, or two tenants tracking
 * the same term) share one request. Adding appId here would silently undo
 * that and multiply store traffic by the number of apps.
 */
export const searchCacheKey = (
  app: Pick<TrackedApp, 'store' | 'country' | 'lang'>,
  keyword: string,
) => `${app.store}|${app.country}|${app.lang}|${keyword.toLowerCase()}`;
function cacheSet(cache: Map<string, SearchHit[]>, key: string, hits: SearchHit[]): void {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, hits);
}

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
  // A run of consecutive failures means the store is throttling us. Backing
  // off and pressing on is right; abandoning the batch at the FIRST sign of it
  // is not, on a list of several hundred keywords a 30-second throttle used to
  // end the whole day's coverage part-way through. Errored keywords are never
  // marked done, so anything skipped is retried on the next tick regardless.
  let consecutiveErrors = 0;
  const ABORT_AFTER_CONSECUTIVE_ERRORS = 30;
  for (const kw of keywordList) {
    const left = timeBudgetMs - (Date.now() - start);
    if (left <= 0) return { rows, exhausted: false };
    const cacheKey = searchCacheKey(app, kw);
    try {
      let hits = searchCache.get(cacheKey);
      if (!hits) {
        hits = await searchStore(app.store, kw, app.country, app.lang);
        cacheSet(searchCache, cacheKey, hits);
        await sleep(delayMs); // stay polite with the store endpoints
      }
      rows.push(keywordRank(app.appId, kw, hits, depth));
      consecutiveErrors = 0;
    } catch (e) {
      rows.push({ keyword: kw, position: null, depth, top: [], error: e instanceof Error ? e.message : String(e) });
      consecutiveErrors++;
      if (consecutiveErrors >= ABORT_AFTER_CONSECUTIVE_ERRORS) return { rows, exhausted: false };
      // Escalating back-off: ride out a short throttle instead of quitting on
      // it — but never sleep past the deadline. A 15s back-off with 2s of
      // budget left just burns the next app's share for nothing.
      await sleep(Math.max(0, Math.min(delayMs * 2 ** Math.min(consecutiveErrors, 5), 15000, left)));
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
    const cacheKey = searchCacheKey(app, kw);
    try {
      let hits = searchCache.get(cacheKey);
      if (!hits) {
        hits = await searchStore(app.store, kw, app.country, app.lang);
        cacheSet(searchCache, cacheKey, hits);
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

/**
 * Retry JUST the top-chart fetch for an app whose LATEST check today failed
 * on it (AppRankResult.error — see checkApp) — no keyword re-searches, so
 * it's cheap enough to attempt on every hourly retry tick, not just once a
 * day. This exists because the nightly marker (nightly.ts) marks a whole
 * tenant "done for today" once its daily block finishes WITHOUT THROWING —
 * but a single app's chart fetch can fail inside that block without failing
 * the run, so once marked done, that app's chart got exactly one attempt
 * per day and silently never retried until tomorrow, no matter how many
 * hourly ticks or manual re-checks happened in between. Returns true if the
 * retry actually succeeded (so the caller knows there's something to log).
 */
export async function retryFailedChart(app: TrackedApp, userId?: string): Promise<boolean> {
  const dateKey = todayKey();
  const snap = loadSnapshot(dateKey, userId);
  const row = snap?.apps.find((a) => a.key === app.key);
  if (!row || !row.error) return false;
  try {
    const { chart, ids } = await fetchTopChart(app.store, app.country, app.lang, app.genreId);
    const idx = ids.indexOf(app.appId);
    row.topChart = { position: idx === -1 ? null : idx + 1, chart, depth: ids.length };
    delete row.error;
    saveSnapshot(snap!, userId);
    return true;
  } catch {
    return false; // still failing — leaves row.error in place for the next retry tick
  }
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
export async function checkCoverageBatch(
  app: TrackedApp,
  userId?: string,
  timeBudgetMs = 20000,
  searchCache: Map<string, SearchHit[]> = new Map(),
): Promise<CoverageBatchResult> {
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

  // The cache is passed in and shared across every app in the run, NOT local
  // to this call. A competitor added against a primary inherits that primary's
  // keyword list, so with a per-app cache the same few hundred searches were
  // repeated once per competitor — 4 apps sharing one list meant 4x the store
  // requests for identical results. That burned the time budget (leaving half
  // the list "not checked") and, worse, made rate-limiting far likelier, which
  // is what turns unchecked keywords into a chart that looks like a mass drop.
  // Sharing collapses those duplicates into one request each; the politeness
  // sleep above only runs on a cache MISS, so a competitor's pass over
  // already-searched keywords costs nothing.
  const { rows, exhausted } = await checkKeywordsBounded(app, remaining, searchCache, 400, timeBudgetMs);
  // A retried keyword replaces its previous (errored) row rather than
  // duplicating it.
  const rechecked = new Set(rows.map((r) => r.keyword));
  const mergedKeywords = [...(existingRow?.keywords || []).filter((k) => !rechecked.has(k.keyword)), ...rows];
  const result: AppRankResult = {
    key: app.key, store: app.store, appId: app.appId, country: app.country,
    listSize: list.length,
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

// Keyword Rank Tracker — data layer. Wraps `google-play-scraper`'s live search
// and category top-chart endpoints so the rest of the engine stays pure/testable.
// Two distinct Play Store signals, both keyed by appId so a caller can look up
// "where is my app vs this competitor":
//   - keyword search rank  -> gplay.search(term)   (what most people mean by "ASO rank")
//   - category top-chart rank -> gplay.list(category) (installs/engagement chart, NOT keyword-specific)
import gplay from 'google-play-scraper';
import { fetchApp, type AsoAppData } from '../aso/fetch';

export const MAX_KEYWORDS = 50;
export const MAX_COMPETITORS = 5;

export interface RankedApp {
  position: number; // 1-based position in the result list
  appId: string;
  title: string;
  developer: string | null;
  score: number | null;
}

export interface KeywordRankResult {
  keyword: string;
  results: RankedApp[]; // full result list actually returned by Play (best-effort length)
  ranks: Record<string, number | null>; // appId -> position, or null if not found in `results`
  error?: string;
}

export interface CategoryRankResult {
  category: string;
  collection: string;
  results: RankedApp[];
  ranks: Record<string, number | null>;
  error?: string;
}

/** Pull a category code ("FINANCE") out of a Play category URL or a bare code. */
export function parseCategory(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const m = raw.match(/\/category\/([A-Za-z_]+)/);
  if (m) return m[1].toUpperCase();
  if (/^[A-Za-z_]+$/.test(raw)) return raw.toUpperCase();
  return null;
}

function toRankedApps(raw: Record<string, any>[]): RankedApp[] {
  return raw.map((a, i) => ({
    position: i + 1,
    appId: String(a.appId || ''),
    title: String(a.title || a.appId || ''),
    developer: a.developer || null,
    score: typeof a.score === 'number' ? a.score : null,
  }));
}

function ranksFor(results: RankedApp[], targetAppIds: string[]): Record<string, number | null> {
  const ranks: Record<string, number | null> = {};
  for (const id of targetAppIds) {
    const hit = results.find((r) => r.appId === id);
    ranks[id] = hit ? hit.position : null;
  }
  return ranks;
}

/**
 * Where each target app ranks in Play's live search results for one keyword.
 * Best-effort: a failed/blocked search never throws, it just reports every
 * target app as not-found with the error attached, so one bad keyword doesn't
 * sink a whole batch.
 */
export async function searchKeywordRank(
  keyword: string,
  targetAppIds: string[],
  opts: { country?: string; lang?: string; num?: number } = {},
): Promise<KeywordRankResult> {
  const country = opts.country || 'in';
  const lang = opts.lang || 'en';
  const num = Math.min(Math.max(opts.num || 100, 1), 250);
  try {
    const raw = (await gplay.search({ term: keyword, num, country, lang })) as Record<string, any>[];
    const results = toRankedApps(raw);
    return { keyword, results, ranks: ranksFor(results, targetAppIds) };
  } catch (e) {
    return {
      keyword,
      results: [],
      ranks: ranksFor([], targetAppIds),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Where each target app sits in a category's Top Free/Grossing chart. This is
 * NOT keyword-specific — Play doesn't expose "top apps for category X ranked
 * by keyword Y" as a single lookup, so this is reported as a separate signal.
 */
export async function categoryTopChartRank(
  category: string,
  targetAppIds: string[],
  opts: { country?: string; lang?: string; num?: number; collection?: string } = {},
): Promise<CategoryRankResult> {
  const country = opts.country || 'in';
  const lang = opts.lang || 'en';
  const num = Math.min(Math.max(opts.num || 200, 1), 500);
  const collection = opts.collection || gplay.collection.TOP_FREE;
  try {
    const raw = (await gplay.list({ category: category as any, collection: collection as any, num, country, lang })) as Record<string, any>[];
    const results = toRankedApps(raw);
    return { category, collection, results, ranks: ranksFor(results, targetAppIds) };
  } catch (e) {
    return {
      category,
      collection,
      results: [],
      ranks: ranksFor([], targetAppIds),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface AppLabel { appId: string; title: string; url: string; found: boolean }

/** Resolve an appId to a display title/url. Best-effort — an unresolvable id still gets a usable label. */
export async function labelApp(appId: string, lang: string, country: string): Promise<AppLabel> {
  try {
    const app: AsoAppData = await fetchApp(appId, lang, country);
    return { appId, title: app.title, url: app.url, found: true };
  } catch {
    return { appId, title: appId, url: `https://play.google.com/store/apps/details?id=${appId}`, found: false };
  }
}

/** Run keyword searches one at a time (Play throttles/blocks bursty concurrent scraping). */
export async function trackKeywords(
  keywords: string[],
  targetAppIds: string[],
  opts: { country?: string; lang?: string; num?: number } = {},
): Promise<KeywordRankResult[]> {
  const out: KeywordRankResult[] = [];
  for (const kw of keywords) {
    out.push(await searchKeywordRank(kw, targetAppIds, opts));
  }
  return out;
}

export interface TopCompetitor {
  appId: string;
  title: string;
  appearances: number; // # of the checked keywords where this app placed in the top `positionThreshold`
  outOf: number; // total keywords considered (successful searches only)
  avgPosition: number;
  bestPosition: number;
}

/**
 * Which OTHER apps (not the ones you're already tracking) keep showing up
 * near the top across your keyword list — i.e. who's actually dominating
 * these search terms, whether or not you added them as a competitor.
 * Ranked by how often they appear in the top `positionThreshold`, then by
 * how high up they tend to be.
 */
export function aggregateTopCompetitors(
  keywordResults: KeywordRankResult[],
  excludeAppIds: string[],
  opts: { topN?: number; positionThreshold?: number } = {},
): TopCompetitor[] {
  const topN = opts.topN ?? 5;
  const threshold = opts.positionThreshold ?? 10;
  const exclude = new Set(excludeAppIds);
  const tally = new Map<string, { title: string; positions: number[] }>();
  const outOf = keywordResults.filter((k) => !k.error).length;

  for (const kr of keywordResults) {
    if (kr.error) continue;
    for (const r of kr.results) {
      if (r.position > threshold) break; // results are already position-ordered
      if (exclude.has(r.appId)) continue;
      const entry = tally.get(r.appId) || { title: r.title, positions: [] };
      entry.positions.push(r.position);
      tally.set(r.appId, entry);
    }
  }

  return Array.from(tally.entries())
    .map(([appId, v]) => ({
      appId,
      title: v.title,
      appearances: v.positions.length,
      outOf,
      avgPosition: Math.round((v.positions.reduce((a, b) => a + b, 0) / v.positions.length) * 10) / 10,
      bestPosition: Math.min(...v.positions),
    }))
    .sort((a, b) => b.appearances - a.appearances || a.avgPosition - b.avgPosition)
    .slice(0, topN);
}

export type CompactKeywordRankResult = Omit<KeywordRankResult, 'results'>;

/** Drops the raw (up to 250-entry) result list once ranks + top competitors are computed from it — no reason to carry that weight into a saved run or an API response. */
export function compactKeywordResult(kr: KeywordRankResult): CompactKeywordRankResult {
  const { results, ...rest } = kr;
  return rest;
}

export interface RankSummary {
  total: number; // keywords successfully checked (search didn't error)
  rank1: number;
  top3: number; // cumulative — includes rank1
  top10: number; // cumulative — includes top3
  top50: number; // cumulative — includes top10
  notFound: number;
  errors: number;
}

/** Bucket one app's ranks across a run's keywords into #1 / top 3 / top 10 / top 50 / not found. */
export function summarizeRanks(keywords: CompactKeywordRankResult[], appId: string): RankSummary {
  let rank1 = 0, top3 = 0, top10 = 0, top50 = 0, notFound = 0, errors = 0;
  for (const k of keywords) {
    if (k.error) { errors++; continue; }
    const pos = k.ranks[appId];
    if (pos == null) { notFound++; continue; }
    if (pos <= 50) top50++;
    if (pos <= 10) top10++;
    if (pos <= 3) top3++;
    if (pos === 1) rank1++;
  }
  return { total: keywords.length - errors, rank1, top3, top10, top50, notFound, errors };
}

export interface Mover {
  keyword: string;
  from: number | null; // null = wasn't found last time
  to: number | null; // null = not found this time
  delta: number; // positive = improved (moved to a lower/better position number)
}

/**
 * Keywords whose position for `appId` changed between two runs. "Not found"
 * is treated as a large-but-finite position (300) so appearing/disappearing
 * from the results still registers as a real move, not an untracked no-op.
 */
export function computeMovers(
  current: CompactKeywordRankResult[],
  previous: CompactKeywordRankResult[],
  appId: string,
  opts: { limit?: number } = {},
): { gained: Mover[]; lost: Mover[] } {
  const NOT_FOUND_POS = 300;
  const prevByKeyword = new Map(previous.filter((k) => !k.error).map((k) => [k.keyword, k]));
  const movers: Mover[] = [];

  for (const k of current) {
    if (k.error) continue;
    const prev = prevByKeyword.get(k.keyword);
    if (!prev) continue; // no baseline for this keyword yet
    const to = k.ranks[appId] ?? null;
    const from = prev.ranks[appId] ?? null;
    const delta = (from ?? NOT_FOUND_POS) - (to ?? NOT_FOUND_POS);
    if (delta === 0) continue;
    movers.push({ keyword: k.keyword, from, to, delta });
  }

  const limit = opts.limit ?? 5;
  return {
    gained: movers.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit),
    lost: movers.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit),
  };
}

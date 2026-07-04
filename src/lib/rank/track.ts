// Keyword Rank Tracker — data layer. Wraps `google-play-scraper`'s live search
// and category top-chart endpoints so the rest of the engine stays pure/testable.
// Two distinct Play Store signals, both keyed by appId so a caller can look up
// "where is my app vs this competitor":
//   - keyword search rank  -> gplay.search(term)   (what most people mean by "ASO rank")
//   - category top-chart rank -> gplay.list(category) (installs/engagement chart, NOT keyword-specific)
import gplay from 'google-play-scraper';

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

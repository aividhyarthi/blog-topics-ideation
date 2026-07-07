// Rank Tracker — data layer. All store network access lives here so the
// ranking/diff engine (track.ts) stays pure and testable.
//
// Sources (no paid APIs — same class of data App Radar builds on):
//  - Google Play search + top charts: `google-play-scraper` (already used by /aso)
//  - Apple App Store search: iTunes Search API (public, keyless)
//  - Apple top charts: Apple marketing RSS feed (public, keyless)
//
// Honesty note: store search APIs approximate what users see on-device.
// Live rankings are personalized/experiment-bucketed, so positions here are a
// consistent, comparable-over-time signal — exactly what commercial ASO
// trackers show — not a per-device guarantee.
import gplay from 'google-play-scraper';
import type { Store } from './types';

export interface SearchHit {
  appId: string;
  title: string;
}

export interface AppMeta {
  store: Store;
  appId: string;
  title: string;
  developer: string | null;
  icon: string | null;
  url: string | null;
  genreId: string | null;
  score: number | null;
  ratings: number | null;
}

/** How deep we scan search results for a tracked app (iTunes Search API caps at 200). */
export const SEARCH_DEPTH_PLAY = 200;
export const SEARCH_DEPTH_IOS = 200;
export const CHART_DEPTH = 200;

const IOS_UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: IOS_UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

/* ------------------------------- id parsing ------------------------------ */

/**
 * Parse user input into a (store, appId) pair. Accepts:
 *  - Play URL (…play.google.com/store/apps/details?id=com.x) or bare package id
 *  - App Store URL (…apps.apple.com/in/app/name/id310633997) or bare numeric id
 * A Play URL's `&gl=XX` storefront param (if present) is picked up as the
 * country hint too — same idea as the iOS URL's country path segment below —
 * so pasting a link copied from a specific country's Play Store front
 * defaults to searching that same front, instead of silently defaulting to
 * "us" for an app that may not even be listed there.
 */
export function parseAppInput(input: string): { store: Store; appId: string; country?: string } | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  const play = raw.match(/[?&]id=([a-zA-Z][\w.]+)/);
  if (play) {
    const gl = raw.match(/[?&]gl=([a-zA-Z]{2})\b/);
    return { store: 'play', appId: play[1], country: gl ? gl[1].toLowerCase() : undefined };
  }
  const ios = raw.match(/apps\.apple\.com\/(?:([a-z]{2})\/)?[^\s]*?id(\d{6,})/i);
  if (ios) return { store: 'ios', appId: ios[2], country: ios[1] || undefined };
  if (/^id?\d{6,}$/.test(raw)) return { store: 'ios', appId: raw.replace(/^id/, '') };
  if (/^[a-zA-Z][\w]*(\.[a-zA-Z0-9_]+)+$/.test(raw)) return { store: 'play', appId: raw };
  return null;
}

/* ------------------------------ app metadata ----------------------------- */

export async function fetchAppMeta(store: Store, appId: string, country: string, lang: string): Promise<AppMeta> {
  if (store === 'play') {
    const a = (await gplay.app({ appId, country, lang })) as Record<string, any>;
    return {
      store, appId,
      title: String(a.title || appId),
      developer: a.developer || null,
      icon: a.icon || null,
      url: a.url || `https://play.google.com/store/apps/details?id=${appId}`,
      genreId: a.genreId || null,
      score: typeof a.score === 'number' ? a.score : null,
      ratings: typeof a.ratings === 'number' ? a.ratings : null,
    };
  }
  const data = await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=${encodeURIComponent(country)}`);
  const a = data?.results?.[0];
  if (!a) throw new Error(`No app with id ${appId} on the ${country.toUpperCase()} App Store.`);
  return {
    store, appId: String(a.trackId),
    title: String(a.trackName || appId),
    developer: a.artistName || null,
    icon: a.artworkUrl100 || a.artworkUrl60 || null,
    url: a.trackViewUrl || null,
    genreId: a.primaryGenreId ? String(a.primaryGenreId) : null,
    score: typeof a.averageUserRating === 'number' ? Math.round(a.averageUserRating * 10) / 10 : null,
    ratings: typeof a.userRatingCount === 'number' ? a.userRatingCount : null,
  };
}

/* ----------------------------- keyword search ----------------------------- */

/** Ordered search results for a keyword on the given store front. */
export async function searchStore(store: Store, keyword: string, country: string, lang: string): Promise<SearchHit[]> {
  if (store === 'play') {
    const res = (await gplay.search({ term: keyword, num: SEARCH_DEPTH_PLAY, country, lang })) as Record<string, any>[];
    return res.map((r) => ({ appId: String(r.appId), title: String(r.title || '') }));
  }
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(keyword)}&entity=software&country=${encodeURIComponent(country)}&limit=${SEARCH_DEPTH_IOS}`,
  );
  const results: Record<string, any>[] = Array.isArray(data?.results) ? data.results : [];
  return results.map((r) => ({ appId: String(r.trackId), title: String(r.trackName || '') }));
}

export const searchDepth = (store: Store) => (store === 'play' ? SEARCH_DEPTH_PLAY : SEARCH_DEPTH_IOS);

/* ------------------------------- top charts ------------------------------ */

/**
 * Top Free chart for the app's home turf. Play: the app's own category chart
 * (falls back to overall). iOS: the storefront's overall Top Free (Apple's
 * public RSS has no per-category feed anymore).
 */
export async function fetchTopChart(
  store: Store, country: string, lang: string, genreId: string | null,
): Promise<{ chart: string; ids: string[] }> {
  if (store === 'play') {
    const opts: Record<string, any> = { collection: 'TOP_FREE', num: CHART_DEPTH, country, lang };
    if (genreId) opts.category = genreId;
    const res = (await gplay.list(opts)) as Record<string, any>[];
    return { chart: genreId ? `Top Free · ${genreId}` : 'Top Free', ids: res.map((r) => String(r.appId)) };
  }
  const data = await fetchJson(
    `https://rss.marketingtools.apple.com/api/v2/${encodeURIComponent(country)}/apps/top-free/${CHART_DEPTH}/apps.json`,
  );
  const results: Record<string, any>[] = data?.feed?.results || [];
  return { chart: 'Top Free (overall)', ids: results.map((r) => String(r.id)) };
}

// Rank Tracker — shared types.
//
// The tracker follows the App Radar model: you register apps (Google Play
// and/or Apple App Store), attach keywords per app, and every "check" records
// where each app ranks in store search for each keyword (plus its top-charts
// position). Snapshots are stored per day so ranks can be trended over time.

export type Store = 'play' | 'ios';

/** A dated marker the owner logs against an app — an ASO experiment or a paid
 * marketing push — so the rank/visibility trend can be read against it. */
export interface Annotation {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'experiment' | 'paid';
  label: string;
}

export interface TrackedApp {
  /** Stable key used in snapshots: `${store}:${appId}` */
  key: string;
  store: Store;
  /** Play package id (com.whatsapp) or App Store numeric id (310633997). */
  appId: string;
  /** Country whose store front is searched (ISO-3166 alpha-2, lowercase). */
  country: string;
  /** Language for Play results (Play only; iOS uses the storefront default). */
  lang: string;
  /** Display metadata captured when the app was added (best-effort). */
  title: string;
  developer: string | null;
  icon: string | null;
  url: string | null;
  genreId: string | null; // Play category id (used for top-charts lookup)
  keywords: string[];
  addedAt: string;
  annotations?: Annotation[];
  /** The FULL keyword universe the owner cares about (up to 2000) — separate
   * from `keywords` (the plan-limited subset checked daily). Checked by the
   * nightly cron once the list is large; the on-demand button is only
   * practical for smaller lists. */
  coverageKeywords?: string[];
  /** User-supplied search volume per keyword (lowercased keyword -> volume),
   * pasted alongside the keyword itself (e.g. from a keyword-research
   * spreadsheet) — distinct from the automatic Google Trends proxy used in
   * keyword discovery. Keyed by keyword text so it survives independent of
   * which list (tracked vs coverage) that keyword happens to be in. */
  keywordVolumes?: Record<string, number>;
}

export interface TrackerConfig {
  apps: TrackedApp[];
}

/**
 * Cached result of a full ASO Inspector audit for a tracked app — includes
 * the (paid, Anthropic-backed) AI verdict, so this is only ever regenerated
 * on a real trigger (app added, keywords changed, explicit re-check), never
 * just from loading/refreshing the page. Keyed by TrackedApp.key.
 */
export interface AsoCacheEntry {
  focusList: string[];
  data: unknown; // the full /api/aso response (report, ai, app, competitors, ...)
  checkedAt: string; // ISO timestamp
}
export type AsoCache = Record<string, AsoCacheEntry>;

/** One day's rating snapshot for an app — cheap (no AI, no Play reviews
 * pagination beyond what fetchRecentReviews already does), so this can run
 * in the nightly cron for every tracked app without touching the ASO
 * audit's paid AI budget. Powers the "1-2★ share over time" trend. */
export interface RatingHistoryPoint {
  dateKey: string; // YYYY-MM-DD
  total: number;
  negativeShare: number; // % that are 1-2★
  tone: 'good' | 'mid' | 'bad' | 'na';
  windowDays: number; // the actual adaptive window this point was computed over (see fetchRecentReviews)
}
export type RatingHistory = Record<string, RatingHistoryPoint[]>; // keyed by TrackedApp.key

/** One keyword's result inside a snapshot. */
export interface KeywordRank {
  keyword: string;
  /** 1-based position in store search results; null = not in the top `depth`. */
  position: number | null;
  /** How many results were scanned (the tracking depth). */
  depth: number;
  /** Top 3 apps holding the keyword (who owns the term right now). */
  top: { appId: string; title: string }[];
  error?: string;
}

export interface AppRankResult {
  key: string;
  store: Store;
  appId: string;
  country: string;
  keywords: KeywordRank[];
  /** Position in the store's Top Free chart (Play: app's category; iOS: overall). null = outside. */
  topChart: { position: number | null; chart: string; depth: number } | null;
  /** Listing outcome metrics recorded alongside ranks (context, not part of rank). */
  score: number | null;
  ratings: number | null;
  error?: string;
}

/** One full check across all tracked apps — persisted per day. */
export interface RankSnapshot {
  dateKey: string; // YYYY-MM-DD
  checkedAt: string; // ISO timestamp of the (latest) check that day
  apps: AppRankResult[];
}

/** Trend row computed by diffing snapshots — what the UI renders. */
export interface KeywordTrend {
  keyword: string;
  position: number | null;
  /** prevPosition - position: positive = moved up, negative = dropped. */
  delta: number | null;
  prevPosition: number | null;
  best: number | null; // best (lowest) position ever recorded
  /** Oldest→newest positions for the sparkline (null = unranked that day). */
  history: (number | null)[];
  top: { appId: string; title: string }[];
  error?: string;
  /** Whether the latest snapshot actually searched this keyword at all — a
   * keyword can be absent from every snapshot (just added, or the coverage
   * list is too large for the on-demand check and is waiting on the nightly
   * cron) and `position: null` looks identical to "searched, ranked beyond
   * depth" unless this is checked too. */
  checked: boolean;
}

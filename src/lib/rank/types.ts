// Rank Tracker — shared types.
//
// The tracker follows the App Radar model: you register apps (Google Play
// and/or Apple App Store), attach keywords per app, and every "check" records
// where each app ranks in store search for each keyword (plus its top-charts
// position). Snapshots are stored per day so ranks can be trended over time.

export type Store = 'play' | 'ios';

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
}

export interface TrackerConfig {
  apps: TrackedApp[];
}

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
}

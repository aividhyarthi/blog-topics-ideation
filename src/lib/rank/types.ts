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
  /** Specific keywords this change targeted (e.g. added to the title, or
   * promoted into the daily-tracked list). When set, ranking impact is shown
   * per keyword (position before vs after) alongside the app-wide average
   * visibility delta — a handful of keyword edits rarely moves the whole-app
   * average enough to read, so the targeted keywords need their own before/
   * after. Optional: broad changes (a redesign, a paid push) have nothing
   * specific to list here. */
  keywords?: string[];
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
  /** Play's developerId / iOS's artistId, captured when the app was added.
   * Older tracked apps predate this field and have it as null/undefined —
   * treat that as "unknown", never as "definitely a different developer". */
  developerId?: string | null;
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
  /** Comma-separated email addresses for the daily rank report — sent by the
   * nightly scheduler after this app's check completes. Blank/unset means no
   * report is sent for this app. */
  reportEmails?: string;
  /** Set when this app was added via "this app is a competitor for <X>"
   * (see api/rank.ts's add-app likeApp handling) — the key of that primary
   * app. Purely a UI hint: groups this app under "Competitors" in the
   * sidebar and lets its own listing shortcut straight into that app's
   * Compare tab instead of its own Overview. Never affects checking —
   * a competitor app is still checked and stored exactly like any other
   * tracked app. Unset for apps added directly (your own apps). */
  competitorOf?: string;
  /** Rank-drop alert threshold: 10 / 30 / 100. When set, the nightly check
   * emails the reportEmails list whenever a daily-tracked keyword that was
   * inside the top N falls out of it (or out of the results entirely).
   * Unset = alerts off. Uses the same recipient list as the daily report
   * so there's exactly one place to manage who gets notified. */
  alertTopN?: number;
  /** dateKey (YYYY-MM-DD) of the last weekly digest email sent for this
   * app — guards against double-sending if the nightly check runs more
   * than once on a Monday (e.g. an admin "Run now" after the scheduled
   * run already fired). */
  lastWeeklyDigest?: string;
  /**
   * Local (IST) hour window this app is allowed to be checked in, e.g.
   * `{ startHour: 0, endHour: 4 }` for midnight–4am. Staggering apps across
   * separate windows is what keeps a big portfolio from hammering the store
   * endpoints all at once — the single biggest cause of the rate-limit
   * errors that show up as "keyword not checked / failed" the next morning.
   * Unset = checkable any time inside the nightly window (previous
   * behaviour). Ignored on weekends (see isWithinCheckWindow) when there's
   * no contention worth staggering around.
   */
  checkWindow?: { startHour: number; endHour: number };
  /**
   * Most REAL store searches this app may issue per scheduler tick. The
   * nightly scheduler ticks hourly, so this is effectively a per-hour rate
   * limit for this app — the knob for "be gentle with the store" without
   * giving up on checking everything, since whatever the cap leaves
   * un-searched is picked up by the next tick rather than lost.
   *
   * Cache hits don't count (they never reach the store), so a competitor
   * sharing its primary's keywords costs the primary's allowance once, not
   * once per app. Unset = no per-app cap (only the run's time budget).
   *
   * Sizing it: an app finishes its full list in
   * ceil(unique keywords / cap) hours, so the window it runs in needs at
   * least that many hours. 645 keywords at 100/hour needs 7 hours.
   */
  hourlyRequestCap?: number;
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
  // Raw per-star counts (5★ down to 1★) for this same window — the % above
  // is derived from these, but a raw "12 of 340" reads very differently from
  // "12 of 34" at the same percentage, so both are kept rather than forcing
  // the dashboard to reconstruct counts from a rounded percentage.
  counts?: { star: 1 | 2 | 3 | 4 | 5; count: number; pct: number }[];
}
export type RatingHistory = Record<string, RatingHistoryPoint[]>; // keyed by TrackedApp.key

/** One AI-extracted complaint theme from recent negative (1-3★) reviews. */
export interface ReviewTheme {
  theme: string;   // short label, e.g. "Login / OTP failures"
  count: number;   // how many of the analysed reviews mention it
  example: string; // one representative quote, verbatim (truncated)
}
/** Cached result of a review-theme analysis — refreshed only on an explicit
 * click (it costs an AI call), never automatically. Keyed by TrackedApp.key. */
export interface ReviewThemesEntry {
  checkedAt: string;      // ISO timestamp
  windowDays: number;     // actual span the analysed reviews cover
  totalReviews: number;   // reviews fetched in the window
  negativeAnalysed: number; // 1-3★ reviews with text that were sent for analysis
  themes: ReviewTheme[];
}
export type ReviewThemesCache = Record<string, ReviewThemesEntry>;

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
  /** How many keywords the app's list held when this result was written.
   * Coverage checks save PARTIAL progress (see checkCoverageBatch), so
   * `keywords.length` is "how far the run got today", not the size of the
   * list. Without this the universe chart plotted run progress and showed a
   * finished day as a cliff back to full size the next morning. */
  listSize?: number;
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

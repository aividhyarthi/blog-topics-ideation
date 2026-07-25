// Rank Tracker — pure ranking/trend engine. No network, no filesystem:
// everything here takes data in and returns data out, so it is unit-testable
// (see scripts/validate-rank.ts) and independent of which store the data
// came from.
import type { AppRankResult, KeywordRank, KeywordTrend, RankSnapshot, TrackedApp } from './types';
import type { SearchHit } from './fetch';

/** 1-based position of `appId` in an ordered result list; null = not present. */
export function findPosition(appId: string, results: { appId: string }[]): number | null {
  const idx = results.findIndex((r) => r.appId === appId);
  return idx === -1 ? null : idx + 1;
}

export function keywordRank(appId: string, keyword: string, results: SearchHit[], depth: number): KeywordRank {
  return {
    keyword,
    position: findPosition(appId, results),
    depth,
    top: results.slice(0, 3).map((r) => ({ appId: r.appId, title: r.title })),
  };
}

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** IST is UTC+5:30 and has no DST, so a fixed offset is exact here. */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
export const istParts = (now: Date) => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return { hour: ist.getUTCHours(), day: ist.getUTCDay() }; // day: 0=Sun, 6=Sat
};

/**
 * Is this app allowed to be checked right now?
 *
 * Apps are staggered into separate IST hour windows (see TrackedApp.checkWindow)
 * so a portfolio doesn't fire every keyword search at the store simultaneously
 * — concurrent bursts are what trigger the rate-limiting that surfaces the next
 * morning as "most keyword rankings not checked or failed".
 *
 * Two deliberate escape hatches:
 *  - No window set → always allowed (unchanged behaviour for existing apps).
 *  - Weekends → all windows ignored, so a list too big to finish inside a
 *    4-hour weekday slot can use the whole day to catch up.
 *
 * A window may wrap past midnight (e.g. 22→2), handled below.
 */
export function isWithinCheckWindow(app: TrackedApp, now = new Date()): boolean {
  const w = app.checkWindow;
  if (!w) return true;
  const { hour, day } = istParts(now);
  if (day === 0 || day === 6) return true; // weekend: no staggering needed
  if (w.startHour === w.endHour) return true; // degenerate/full-day window
  return w.startHour < w.endHour
    ? hour >= w.startHour && hour < w.endHour
    : hour >= w.startHour || hour < w.endHour; // wraps past midnight
}

/**
 * Trend rows for one app: latest snapshot vs the previous one, with best-ever
 * position and a compact oldest→newest history for sparklines.
 * `snapshots` must be sorted oldest→newest. `keywordList` defaults to the
 * app's plan-limited tracked keywords, but the coverage view passes the full
 * keyword universe (against coverage snapshots) to build the same kind of
 * rows for every keyword the owner cares about, not just the daily-tracked
 * subset.
 */
export function keywordTrends(app: TrackedApp, snapshots: RankSnapshot[], historyDays = 30, keywordList: string[] = app.keywords): KeywordTrend[] {
  const perSnap = snapshots.map((s) => s.apps.find((a) => a.key === app.key) || null);
  const latest = perSnap.length ? perSnap[perSnap.length - 1] : null;
  const prev = perSnap.length > 1 ? perSnap[perSnap.length - 2] : null;

  return keywordList.map((kw) => {
    const find = (r: AppRankResult | null) => r?.keywords.find((k) => k.keyword === kw) || null;
    const cur = find(latest);
    const before = find(prev);
    const history = perSnap.slice(-historyDays).map((r) => find(r)?.position ?? null);
    const ranked = history.filter((p): p is number => p !== null);
    return {
      keyword: kw,
      position: cur?.position ?? null,
      prevPosition: before?.position ?? null,
      // Unranked→ranked and ranked→unranked transitions have no numeric delta;
      // the UI renders those as "new" / "out".
      delta: cur?.position != null && before?.position != null ? before.position - cur.position : null,
      best: ranked.length ? Math.min(...ranked) : null,
      history,
      top: cur?.top ?? [],
      // cur is null both when the keyword was searched and ranked beyond
      // depth, AND when it was never included in the latest check at all
      // (just added, or a coverage list too large for the on-demand button,
      // still waiting on the nightly cron) — this tells those two apart.
      checked: cur !== null,
      error: cur?.error,
    };
  });
}

/** Chart position trend (same shape logic as keywords, for the top-chart row). */
export function chartTrend(app: TrackedApp, snapshots: RankSnapshot[], historyDays = 30): {
  chart: string | null; position: number | null; delta: number | null; history: (number | null)[]; dateKeys: string[]; error?: string; depth: number | null;
} {
  const perSnap = snapshots.map((s) => s.apps.find((a) => a.key === app.key) || null);
  const latest = perSnap.length ? perSnap[perSnap.length - 1] : null;
  const prev = perSnap.length > 1 ? perSnap[perSnap.length - 2] : null;
  const cur = latest?.topChart?.position ?? null;
  const before = prev?.topChart?.position ?? null;
  return {
    chart: latest?.topChart?.chart ?? null,
    // How many chart entries were ACTUALLY compared against. The store's
    // chart endpoint routinely returns far fewer rows than requested, so
    // "not in the chart" can really mean "not in the top 50" while the UI
    // implies the full 200 was checked — a materially different claim, and
    // the difference between "we're not ranking" and "we didn't look far
    // enough". Surfaced so the UI can state the real number it verified.
    depth: latest?.topChart?.depth ?? null,
    position: cur,
    delta: cur != null && before != null ? before - cur : null,
    history: perSnap.slice(-historyDays).map((r) => r?.topChart?.position ?? null),
    dateKeys: snapshots.slice(-historyDays).map((s) => s.dateKey),
    // checkApp records a failed top-chart fetch as AppRankResult.error rather
    // than throwing (a chart hiccup must never block keyword checks) — but
    // that left the failure completely silent here: `topChart: null` reads
    // identically to "checked, confirmed not in the chart", so a PERSISTENT
    // fetch failure (bad category id, rate limit) looked exactly like a real
    // "not ranked" result forever. Surface it so the UI can tell the two
    // apart instead of reporting a confident false negative.
    error: latest?.error,
  };
}

/* ------------------------- overview (App Radar view) ------------------------- */

/** Ordered rank buckets for the distribution chart. Anything deeper is "Unranked". */
export const RANK_BUCKETS = [
  { label: 'Top 1', min: 1, max: 1 },
  { label: 'Top 2–3', min: 2, max: 3 },
  { label: 'Top 4–10', min: 4, max: 10 },
  { label: 'Top 11–30', min: 11, max: 30 },
  { label: 'Top 31–100', min: 31, max: 100 },
  { label: 'Top 101–200', min: 101, max: 200 },
] as const;

/** Index into RANK_BUCKETS, or -1 for unranked/not found. */
export function bucketIndex(position: number | null): number {
  if (position == null) return -1;
  return RANK_BUCKETS.findIndex((b) => position >= b.min && position <= b.max);
}

export interface TopCounts { top1: number; top10: number; top30: number; top100: number; }

/** App Radar's headline tiles: how many keywords rank at #1 / top 10 / top 30 / top 100. */
export function topCounts(positions: (number | null)[]): TopCounts {
  const c: TopCounts = { top1: 0, top10: 0, top30: 0, top100: 0 };
  for (const p of positions) {
    if (p == null) continue;
    if (p <= 1) c.top1++;
    if (p <= 10) c.top10++;
    if (p <= 30) c.top30++;
    if (p <= 100) c.top100++;
  }
  return c;
}

/**
 * Search Visibility Score, 0–100: each keyword contributes on a log curve
 * (#1 = 100, #10 ≈ 57, #100 ≈ 13, unranked = 0), averaged over all tracked
 * keywords. Commercial tools additionally weight by keyword search volume —
 * that needs paid data, so here every keyword weighs the same.
 */
export function visibilityScore(positions: (number | null)[]): number {
  if (!positions.length) return 0;
  const pts = positions.map((p) => (p == null || p > 200 ? 0 : 100 * (1 - Math.log(p) / Math.log(201))));
  return Math.round((pts.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10;
}

/**
 * Headline counts derived from a day's bucket array — the bucket edges
 * (1 / 3 / 10 / 30 / 100) line up with the tile thresholds by construction.
 */
export function countsFromBuckets(buckets: number[]): TopCounts {
  const sum = (n: number) => buckets.slice(0, n).reduce((a, b) => a + b, 0);
  return { top1: sum(1), top10: sum(3), top30: sum(4), top100: sum(5) };
}

export interface OverviewDay {
  dateKey: string;
  /** Keyword count per RANK_BUCKETS entry, then unranked as the last element. */
  buckets: number[];
  visibility: number;
  tracked: number;
  /** Keywords whose check FAILED that day (store error), and keywords that
   * weren't searched at all. Neither is counted in `buckets`/`visibility` —
   * see the note in the function body for why that matters. */
  failed: number;
  unchecked: number;
}

/**
 * Merges the daily-tracked and coverage snapshot series into one series per
 * day, so a keyword's result is visible no matter WHICH of the two checks
 * happened to produce it.
 *
 * The two lists overlap: a keyword can sit in both `keywords` (checked every
 * day) and `coverageKeywords` (checked in time-bounded batches that may not
 * reach it for days). Reading only the coverage snapshots — which is what
 * every coverage-scoped view used to do — therefore showed a keyword as
 * unranked/not-checked even when that same keyword had a real, fresh
 * position sitting in the same day's DAILY snapshot. That's the "same
 * keyword ranks in one tab and not the other" bug: not a checking failure,
 * a reading failure.
 *
 * Daily wins on conflict (it's re-checked every day, so it's the fresher
 * signal), matching the precedence already used for `difficulty`.
 */
export function mergeSnapshotSets(coverage: RankSnapshot[], daily: RankSnapshot[]): RankSnapshot[] {
  const byDate = new Map<string, RankSnapshot>();
  // Coverage first so daily overwrites it on conflict.
  for (const source of [coverage, daily]) {
    for (const snap of source) {
      const existing = byDate.get(snap.dateKey);
      if (!existing) {
        byDate.set(snap.dateKey, {
          dateKey: snap.dateKey,
          checkedAt: snap.checkedAt,
          apps: snap.apps.map((a) => ({ ...a, keywords: [...a.keywords] })),
        });
        continue;
      }
      if (snap.checkedAt > existing.checkedAt) existing.checkedAt = snap.checkedAt;
      for (const app of snap.apps) {
        const target = existing.apps.find((a) => a.key === app.key);
        if (!target) { existing.apps.push({ ...app, keywords: [...app.keywords] }); continue; }
        const merged = new Map(target.keywords.map((k) => [k.keyword, k]));
        for (const kw of app.keywords) {
          // Never let an errored row overwrite a good one from the other
          // series — a failed check is exactly the case the other series
          // might have a real answer for.
          const prev = merged.get(kw.keyword);
          if (prev && kw.error && !prev.error) continue;
          merged.set(kw.keyword, kw);
        }
        target.keywords = [...merged.values()];
        if (app.topChart) target.topChart = app.topChart;
        if (app.score != null) target.score = app.score;
        if (app.ratings != null) target.ratings = app.ratings;
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** Per-day distribution + visibility series for one app (snapshots oldest→newest).
 * `keywordList` defaults to the app's plan-limited tracked keywords, but the
 * coverage overview passes the full keyword universe instead. */
export function overviewSeries(app: TrackedApp, snapshots: RankSnapshot[], days = 30, keywordList: string[] = app.keywords): OverviewDay[] {
  return snapshots.slice(-days).map((s) => {
    const r = s.apps.find((a) => a.key === app.key) || null;
    // Only days on which this app was actually checked produce a bar.
    if (!r) return null;
    const rows = keywordList.map((kw) => r.keywords.find((k) => k.keyword === kw) || null);
    // A keyword whose check ERRORED (store rate-limit/block) has no position,
    // and a keyword that was never searched that day has no row at all —
    // counting either as "Unranked" states a confirmed negative the check
    // never actually established. It also silently drags the visibility
    // score down, so a day the store throttled us looks identical to a day
    // the app genuinely lost rankings. Both are excluded from the buckets
    // and the score, and reported separately so the UI can say so.
    const failed = rows.filter((k) => k && k.error).length;
    const unchecked = rows.filter((k) => !k).length;
    const positions = rows.filter((k) => k && !k.error).map((k) => k!.position ?? null);
    const buckets = new Array(RANK_BUCKETS.length + 1).fill(0);
    for (const p of positions) {
      const i = bucketIndex(p);
      buckets[i === -1 ? RANK_BUCKETS.length : i]++;
    }
    return {
      dateKey: s.dateKey, buckets, visibility: visibilityScore(positions),
      tracked: positions.length, failed, unchecked,
    };
  }).filter((d): d is OverviewDay => d !== null);
}

export interface UniverseSizePoint { dateKey: string; count: number }

/**
 * How many keywords were actually in this app's list on each day it was
 * checked — the REAL historical size, unlike overviewSeries' bucket/tracked
 * count (which applies TODAY's keyword list retroactively to every past
 * day, so it can never show growth). This is what answers "is my keyword
 * universe growing over time" — each snapshot's own keyword-row length,
 * not today's list length re-applied backwards.
 */
export function universeSizeSeries(app: TrackedApp, snapshots: RankSnapshot[], days = 60): UniverseSizePoint[] {
  return snapshots.slice(-days).map((s) => {
    const r = s.apps.find((a) => a.key === app.key) || null;
    if (!r) return null;
    return { dateKey: s.dateKey, count: r.keywords.length };
  }).filter((d): d is UniverseSizePoint => d !== null);
}

export interface KeywordDifficulty {
  /** 0–100; higher = harder to break into. */
  score: number;
  label: 'Easy' | 'Medium' | 'Hard';
  /** Days of top-3 observations the score is based on. */
  days: number;
}

/**
 * Keyword difficulty from top-3 churn — an honest score computed entirely
 * from data this tool already collects, not a black-box estimate. Every
 * daily check stores the top-3 apps for each keyword; over a window:
 *  - few distinct apps ever holding a top-3 spot  = entrenched incumbents
 *  - the same app holding #1 nearly every day     = a dominant leader
 * Both make a keyword hard to break into; lots of churn means the store is
 * still shuffling results and there's room to climb. The tracked app's own
 * appearances are excluded — holding a spot yourself doesn't make the
 * keyword harder FOR you. Needs `minDays` observed days, else null (a
 * 2-day-old keyword has no churn signal worth showing).
 */
export function keywordDifficulties(
  app: TrackedApp,
  snapshots: RankSnapshot[],
  keywordList: string[],
  windowDays = 30,
  minDays = 5,
): Record<string, KeywordDifficulty | null> {
  const perSnap = snapshots.slice(-windowDays).map((s) => s.apps.find((a) => a.key === app.key) || null);
  const out: Record<string, KeywordDifficulty | null> = {};
  for (const kw of keywordList) {
    const dailyTop: string[][] = [];
    for (const r of perSnap) {
      const k = r?.keywords.find((x) => x.keyword === kw);
      if (!k || k.error || !(k.top || []).length) continue;
      dailyTop.push(k.top.filter((t) => t.appId !== app.appId).map((t) => t.appId));
    }
    if (dailyTop.length < minDays) { out[kw] = null; continue; }
    const unique = new Set(dailyTop.flat());
    // Stability: 3 slots filled by only 3 distinct apps all window = 1.0.
    const slots = Math.max(3, Math.max(...dailyTop.map((d) => d.length)));
    const stability = Math.min(1, slots / Math.max(1, unique.size));
    // Dominance: how often the most frequent #1 actually holds #1.
    const firstCounts = new Map<string, number>();
    let firstDays = 0;
    for (const d of dailyTop) {
      if (!d.length) continue;
      firstDays++;
      firstCounts.set(d[0], (firstCounts.get(d[0]) || 0) + 1);
    }
    const dominance = firstDays ? Math.max(...firstCounts.values()) / firstDays : 0;
    const score = Math.round(100 * (0.6 * stability + 0.4 * dominance));
    out[kw] = { score, label: score >= 70 ? 'Hard' : score >= 40 ? 'Medium' : 'Easy', days: dailyTop.length };
  }
  return out;
}

export interface AnnotationImpact {
  before: { avgVisibility: number | null; days: number };
  after: { avgVisibility: number | null; days: number };
  delta: number | null; // after - before, null if either side has no data
}

/**
 * Visibility-score impact of a dated annotation (ASO experiment or paid
 * marketing push): average visibility for the `windowDays` before the
 * annotation date vs the `windowDays` on/after it. A simple, honest
 * before/after read — not a causal claim, since other things can move in
 * the same window too.
 */
export function annotationImpact(days: OverviewDay[], annotationDate: string, windowDays = 14): AnnotationImpact {
  const at = Date.parse(annotationDate);
  const dayMs = 86400000;
  const before = days.filter((d) => { const t = Date.parse(d.dateKey); return t < at && t >= at - windowDays * dayMs; });
  const after = days.filter((d) => { const t = Date.parse(d.dateKey); return t >= at && t <= at + windowDays * dayMs; });
  const avg = (arr: OverviewDay[]) => arr.length ? Math.round((arr.reduce((s, d) => s + d.visibility, 0) / arr.length) * 10) / 10 : null;
  const b = avg(before), a = avg(after);
  return {
    before: { avgVisibility: b, days: before.length },
    after: { avgVisibility: a, days: after.length },
    delta: (b != null && a != null) ? Math.round((a - b) * 10) / 10 : null,
  };
}

/** Merge a fresh check into the day's snapshot (a re-check the same day replaces that app's rows). */
export function mergeIntoSnapshot(existing: RankSnapshot | null, dateKey: string, results: AppRankResult[]): RankSnapshot {
  const kept = (existing?.dateKey === dateKey ? existing.apps : []).filter(
    (a) => !results.some((r) => r.key === a.key),
  );
  return { dateKey, checkedAt: new Date().toISOString(), apps: [...kept, ...results] };
}

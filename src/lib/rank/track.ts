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

/**
 * Trend rows for one app: latest snapshot vs the previous one, with best-ever
 * position and a compact oldest→newest history for sparklines.
 * `snapshots` must be sorted oldest→newest.
 */
export function keywordTrends(app: TrackedApp, snapshots: RankSnapshot[], historyDays = 30): KeywordTrend[] {
  const perSnap = snapshots.map((s) => s.apps.find((a) => a.key === app.key) || null);
  const latest = perSnap.length ? perSnap[perSnap.length - 1] : null;
  const prev = perSnap.length > 1 ? perSnap[perSnap.length - 2] : null;

  return app.keywords.map((kw) => {
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
      error: cur?.error,
    };
  });
}

/** Chart position trend (same shape logic as keywords, for the top-chart row). */
export function chartTrend(app: TrackedApp, snapshots: RankSnapshot[], historyDays = 30): {
  chart: string | null; position: number | null; delta: number | null; history: (number | null)[];
} {
  const perSnap = snapshots.map((s) => s.apps.find((a) => a.key === app.key) || null);
  const latest = perSnap.length ? perSnap[perSnap.length - 1] : null;
  const prev = perSnap.length > 1 ? perSnap[perSnap.length - 2] : null;
  const cur = latest?.topChart?.position ?? null;
  const before = prev?.topChart?.position ?? null;
  return {
    chart: latest?.topChart?.chart ?? null,
    position: cur,
    delta: cur != null && before != null ? before - cur : null,
    history: perSnap.slice(-historyDays).map((r) => r?.topChart?.position ?? null),
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
}

/** Per-day distribution + visibility series for one app (snapshots oldest→newest). */
export function overviewSeries(app: TrackedApp, snapshots: RankSnapshot[], days = 30): OverviewDay[] {
  return snapshots.slice(-days).map((s) => {
    const r = s.apps.find((a) => a.key === app.key) || null;
    // Only days on which this app was actually checked produce a bar.
    if (!r) return null;
    const positions = app.keywords.map((kw) => r.keywords.find((k) => k.keyword === kw)?.position ?? null);
    const buckets = new Array(RANK_BUCKETS.length + 1).fill(0);
    for (const p of positions) {
      const i = bucketIndex(p);
      buckets[i === -1 ? RANK_BUCKETS.length : i]++;
    }
    return { dateKey: s.dateKey, buckets, visibility: visibilityScore(positions), tracked: positions.length };
  }).filter((d): d is OverviewDay => d !== null);
}

/** Merge a fresh check into the day's snapshot (a re-check the same day replaces that app's rows). */
export function mergeIntoSnapshot(existing: RankSnapshot | null, dateKey: string, results: AppRankResult[]): RankSnapshot {
  const kept = (existing?.dateKey === dateKey ? existing.apps : []).filter(
    (a) => !results.some((r) => r.key === a.key),
  );
  return { dateKey, checkedAt: new Date().toISOString(), apps: [...kept, ...results] };
}

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

/** Merge a fresh check into the day's snapshot (a re-check the same day replaces that app's rows). */
export function mergeIntoSnapshot(existing: RankSnapshot | null, dateKey: string, results: AppRankResult[]): RankSnapshot {
  const kept = (existing?.dateKey === dateKey ? existing.apps : []).filter(
    (a) => !results.some((r) => r.key === a.key),
  );
  return { dateKey, checkedAt: new Date().toISOString(), apps: [...kept, ...results] };
}

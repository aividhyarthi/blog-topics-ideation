// Week-over-week trend engine: diff this week's report against the previous
// saved snapshot to produce the "what changed this week" layer the WBR needs.
import type { WbrReport } from './report';
import type { Snapshot } from './store';

export function snapshotFromReport(rep: WbrReport, weekKey: string, label?: string): Snapshot {
  const nykaaTopics: Record<string, { v: number; m: number; vol: number }> = {};
  const categoryMentions: Record<string, number> = {};
  for (const t of rep._primaryTopics ?? []) {
    nykaaTopics[t.name] = { v: t.v, m: t.m, vol: t.vol };
    categoryMentions[t.cat] = (categoryMentions[t.cat] ?? 0) + t.m;
  }
  return {
    vertical: rep.vertical,
    weekKey,
    savedAt: new Date().toISOString(),
    label,
    primaryBrand: rep.primaryBrand,
    primaryLabel: rep.primaryLabel,
    summary: rep.summary,
    categoryMentions,
    nykaaTopics,
    gapTopics: rep.gaps.map((g) => g.topic),
    gapCount: rep.gaps.length,
  };
}

export interface MetricDelta { label: string; prev: number; curr: number; delta: number; pct: number | null; }
export interface TopicMove { topic: string; prev: number; curr: number; delta: number; }

export interface Trends {
  prevWeekKey: string;
  prevLabel?: string;
  currWeekKey: string;
  summaryDeltas: MetricDelta[]; // Nykaa headline movement
  categoryDeltas: MetricDelta[]; // Nykaa mentions by category
  visibilityGainers: TopicMove[];
  visibilityLosers: TopicMove[];
  newTopics: string[]; // appeared this week
  droppedTopics: string[]; // gone this week
  newGaps: string[];
  closedGaps: string[];
  narrative: string[];
}

const pct = (prev: number, curr: number): number | null =>
  prev === 0 ? (curr === 0 ? 0 : null) : ((curr - prev) / prev) * 100;

export function computeTrends(curr: Snapshot, prev: Snapshot): Trends {
  const f = (n: number) => Math.round(n).toLocaleString('en-IN');
  // Default to 'nykaa' so pre-existing saved snapshots (which had no primaryBrand) still diff.
  const primaryKey = curr.primaryBrand ?? 'nykaa';
  const P = curr.primaryLabel ?? 'Nykaa';
  const nykCurr = curr.summary.find((s) => s.brand === primaryKey);
  const nykPrev = prev.summary.find((s) => s.brand === (prev.primaryBrand ?? primaryKey));

  const summaryDeltas: MetricDelta[] = [];
  if (nykCurr && nykPrev) {
    const add = (label: string, a: number, b: number) =>
      summaryDeltas.push({ label, prev: a, curr: b, delta: b - a, pct: pct(a, b) });
    add('Topics in vertical', nykPrev.topicsInVertical, nykCurr.topicsInVertical);
    add('Avg visibility', nykPrev.avgVisibility, nykCurr.avgVisibility);
    add('Total mentions', nykPrev.totalMentions, nykCurr.totalMentions);
    add('Total search volume', nykPrev.totalVolume, nykCurr.totalVolume);
    add('Topics ≥ 60', nykPrev.topics60, nykCurr.topics60);
    add('Topics ≥ 80', nykPrev.topics80, nykCurr.topics80);
  }

  const cats = new Set([...Object.keys(curr.categoryMentions), ...Object.keys(prev.categoryMentions)]);
  const categoryDeltas: MetricDelta[] = [...cats].map((c) => {
    const a = prev.categoryMentions[c] ?? 0, b = curr.categoryMentions[c] ?? 0;
    return { label: c, prev: a, curr: b, delta: b - a, pct: pct(a, b) };
  }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  // Topic-level visibility movement (only topics present both weeks).
  const moves: TopicMove[] = [];
  for (const [name, cur] of Object.entries(curr.nykaaTopics)) {
    const p = prev.nykaaTopics[name];
    if (p) moves.push({ topic: name, prev: p.v, curr: cur.v, delta: cur.v - p.v });
  }
  const visibilityGainers = [...moves].filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
  const visibilityLosers = [...moves].filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 10);

  const currNames = new Set(Object.keys(curr.nykaaTopics));
  const prevNames = new Set(Object.keys(prev.nykaaTopics));
  const newTopics = [...currNames].filter((n) => !prevNames.has(n)).slice(0, 50);
  const droppedTopics = [...prevNames].filter((n) => !currNames.has(n)).slice(0, 50);

  const currGaps = new Set(curr.gapTopics), prevGaps = new Set(prev.gapTopics);
  const newGaps = [...currGaps].filter((g) => !prevGaps.has(g));
  const closedGaps = [...prevGaps].filter((g) => !currGaps.has(g));

  // Narrative bullets
  const narrative: string[] = [];
  const mv = summaryDeltas.find((d) => d.label === 'Total mentions');
  if (mv) {
    const dir = mv.delta >= 0 ? 'up' : 'down';
    narrative.push(`${P} total ${curr.vertical} mentions ${dir} ${f(Math.abs(mv.delta))} (${mv.pct === null ? 'n/a' : mv.pct.toFixed(1) + '%'}) vs ${prev.weekKey}: ${f(mv.prev)} → ${f(mv.curr)}.`);
  }
  const vv = summaryDeltas.find((d) => d.label === 'Avg visibility');
  if (vv) narrative.push(`Average AI visibility moved ${vv.delta >= 0 ? '+' : ''}${vv.delta.toFixed(1)} (${f(vv.prev)} → ${f(vv.curr)}).`);
  const topCat = categoryDeltas[0];
  if (topCat && topCat.delta !== 0) narrative.push(`Biggest category move: ${topCat.label} ${topCat.delta >= 0 ? '+' : ''}${f(topCat.delta)} mentions.`);
  if (visibilityGainers[0]) narrative.push(`Top gainer: “${visibilityGainers[0].topic}” +${visibilityGainers[0].delta} visibility.`);
  if (visibilityLosers[0]) narrative.push(`Biggest drop: “${visibilityLosers[0].topic}” ${visibilityLosers[0].delta} visibility — check this.`);
  if (newGaps.length || closedGaps.length) narrative.push(`Gaps: ${closedGaps.length} closed, ${newGaps.length} new since last week.`);

  return {
    prevWeekKey: prev.weekKey, prevLabel: prev.label, currWeekKey: curr.weekKey,
    summaryDeltas, categoryDeltas, visibilityGainers, visibilityLosers,
    newTopics, droppedTopics, newGaps, closedGaps, narrative,
  };
}

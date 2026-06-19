// AI Visibility Snapshot — the sales-wedge / lead-magnet engine.
//
// Unlike the full WBR (which is Nykaa-centric and tells the whole weekly story),
// the Snapshot is a single-page, PROSPECT-FACING artifact you run on a target
// brand BEFORE they're a client. It answers one brutal question in one screen:
//
//   "Where is <prospect> losing AI-search visibility, and who's taking it?"
//
// It reuses the same SEMrush export shapes (brand_topics / gap_topics) and the
// same deterministic taxonomy as the WBR (parse.ts + categorize.ts), but the
// primary brand is CONFIGURABLE (any prospect, not just Nykaa) and the output is
// trimmed to the few facts that land in a cold outreach / first call:
//
//   1. The prospect's current AI footprint (topics, mentions, avg visibility).
//   2. The "gap reel" — high-volume topics where the prospect = 0 visibility but
//      a named competitor is already cited (the part that stings).
//   3. Category exposure — which product categories are bleeding the most volume.
//   4. The competitor leaderboard — who is eating their category in AI answers.
//
// Everything is derived from the uploaded data so it's defensible on the call.

import { classifyTopic, isBeautyBrand } from './wbr/categorize';
import type { ParsedFile, TopicRow } from './wbr/parse';

export interface SnapshotOptions {
  vertical: 'beauty' | 'fashion';
  // Canonical short brand name of the prospect (e.g. "sugar", "mamaearth").
  // Must match how parse.ts derived the brand from the uploaded filenames.
  primaryBrand: string;
  // Display name shown in the report hero (e.g. "SUGAR Cosmetics").
  prospectName: string;
  // Visibility at/above which a topic is considered "owned" in AI answers.
  ownThreshold?: number;
}

export interface SnapshotGap {
  category: string;
  topic: string;
  volume: number;
  topCompetitor: string;
  topCompetitorMentions: number;
  competitors: Record<string, number>; // label -> mentions
}

export interface CategoryExposure {
  category: string;
  missedVolume: number; // search volume of gap topics in this category
  gapCount: number;
  topCompetitor: string;
}

export interface CompetitorShare {
  brand: string; // display label
  mentions: number; // total mentions across the prospect's gap topics
  topics: number; // # of gap topics where this competitor is cited
}

export interface SnapshotReport {
  prospectName: string;
  vertical: 'beauty' | 'fashion';
  generatedAt: string;
  ownThreshold: number;
  // Prospect's own AI footprint in this vertical.
  primary: {
    topicsInVertical: number;
    totalMentions: number;
    avgVisibility: number;
    topicsOwned: number; // visibility >= ownThreshold
    totalVolume: number;
  } | null;
  // Punchy, data-derived verdict lines for the hero.
  headline: string;
  subhead: string;
  // The gap reel — the heart of the wedge.
  gaps: SnapshotGap[];
  gapCount: number;
  totalGapVolume: number;
  categoryExposure: CategoryExposure[];
  competitors: CompetitorShare[];
  topCompetitor: string | null;
  // What we couldn't compute (so the operator knows what to upload).
  warnings: string[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Generic host -> short display label. Falls back to the registrable-ish name so
// any competitor (not just the hardcoded Indian marketplaces) gets a clean label.
function hostLabel(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, '');
  const core = h.split('/')[0].replace(/\.(com|in|co|net|org|io|store|shop)(\.[a-z]{2})?$/, '');
  const name = core.split('.').pop() || core;
  return name
    .split(/[-_]/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

// True if a gap_mentions host belongs to the prospect (so we can tell whether
// the prospect itself is present on a topic). Matches the short brand name as a
// substring of the host (e.g. "sugar" in "sugarcosmetics.com").
function isPrimaryHost(host: string, primaryBrand: string): boolean {
  return host.toLowerCase().includes(primaryBrand.toLowerCase());
}

function classify(name: string, vertical: 'beauty' | 'fashion') {
  return classifyTopic(name, { vertical });
}

function primaryFootprint(
  topics: TopicRow[], vertical: 'beauty' | 'fashion', ownThreshold: number,
): SnapshotReport['primary'] {
  const inV = topics.filter((t) => classify(t.name, vertical).vertical === vertical);
  if (inV.length === 0) return null;
  const n = inV.length;
  return {
    topicsInVertical: n,
    totalMentions: inV.reduce((s, t) => s + t.mentions, 0),
    avgVisibility: round1(inV.reduce((s, t) => s + t.visibility, 0) / n),
    topicsOwned: inV.filter((t) => t.visibility >= ownThreshold).length,
    totalVolume: inV.reduce((s, t) => s + t.volume, 0),
  };
}

export function buildSnapshot(files: ParsedFile[], opts: SnapshotOptions): SnapshotReport {
  const { vertical, primaryBrand, prospectName } = opts;
  const ownThreshold = opts.ownThreshold ?? (vertical === 'beauty' ? 80 : 60);
  const warnings: string[] = [];

  // Index the prospect's own files. brand_topics gives the footprint; gap_topics
  // (with per-competitor gap_mentions) gives the gap reel + competitor share.
  let brandTopicsFile: ParsedFile | undefined;
  let gapFile: ParsedFile | undefined;
  for (const f of files) {
    if (f.brand !== primaryBrand) continue;
    if (f.type === 'brand_topics' && f.topics) brandTopicsFile = f;
    else if (f.type === 'gap_topics' && f.topics) gapFile = f;
  }
  // gap_topics also carries the brand's own topic list, so it can stand in for
  // brand_topics when only the gap export was provided.
  const footprintTopics = brandTopicsFile?.topics ?? gapFile?.topics ?? [];

  const primary = footprintTopics.length
    ? primaryFootprint(footprintTopics, vertical, ownThreshold)
    : null;
  if (!primary) {
    warnings.push(
      `No ${vertical} topics found for "${primaryBrand}". Check the brand name matches the uploaded filenames, or that the export is the right vertical.`,
    );
  }

  // ---- Gap reel: prospect = 0 visibility, a competitor is cited ----
  const gaps: SnapshotGap[] = [];
  const compTotals = new Map<string, { mentions: number; topics: number }>();
  if (gapFile?.topics) {
    for (const t of gapFile.topics) {
      const gm = t.gapMentions ?? {};
      // Is the prospect present on this topic at all?
      let primaryM = 0;
      for (const [host, v] of Object.entries(gm)) {
        if (isPrimaryHost(host, primaryBrand)) primaryM += v;
      }
      if (primaryM === 0 && Object.keys(gm).length === 0) primaryM = t.mentions ?? 0;
      if (primaryM > 0) continue; // prospect already has visibility — not a gap

      // Confident, in-vertical topics only (keeps the reel credible).
      const c = classify(t.name, vertical);
      if (c.vertical !== vertical || !c.matched) continue;

      const competitors: Record<string, number> = {};
      let topCompetitor = ''; let topMentions = 0;
      for (const [host, v] of Object.entries(gm)) {
        if (isPrimaryHost(host, primaryBrand) || v <= 0) continue;
        const label = hostLabel(host);
        competitors[label] = (competitors[label] ?? 0) + v;
        const agg = compTotals.get(label) ?? { mentions: 0, topics: 0 };
        agg.mentions += v; agg.topics += 1;
        compTotals.set(label, agg);
        if (competitors[label] > topMentions) { topMentions = competitors[label]; topCompetitor = label; }
      }
      if (topMentions === 0) continue; // nobody ranks => not actionable

      gaps.push({
        category: c.category,
        topic: t.name,
        volume: t.volume,
        topCompetitor,
        topCompetitorMentions: topMentions,
        competitors,
      });
    }
  } else {
    warnings.push(
      `No gap_topics export for "${primaryBrand}" — the gap reel (the strongest part of the snapshot) needs the gap_topics CSV, which carries per-competitor mentions.`,
    );
  }

  gaps.sort((a, b) => b.volume - a.volume);
  const totalGapVolume = gaps.reduce((s, g) => s + g.volume, 0);

  // ---- Category exposure: which categories bleed the most missed volume ----
  const catMap = new Map<string, { missedVolume: number; gapCount: number; comp: Map<string, number> }>();
  for (const g of gaps) {
    const e = catMap.get(g.category) ?? { missedVolume: 0, gapCount: 0, comp: new Map() };
    e.missedVolume += g.volume; e.gapCount += 1;
    e.comp.set(g.topCompetitor, (e.comp.get(g.topCompetitor) ?? 0) + g.topCompetitorMentions);
    catMap.set(g.category, e);
  }
  const categoryExposure: CategoryExposure[] = [...catMap.entries()]
    .map(([category, e]) => ({
      category,
      missedVolume: e.missedVolume,
      gapCount: e.gapCount,
      topCompetitor: [...e.comp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—',
    }))
    .sort((a, b) => b.missedVolume - a.missedVolume);

  // ---- Competitor leaderboard ----
  const competitors: CompetitorShare[] = [...compTotals.entries()]
    .map(([brand, v]) => ({ brand, mentions: v.mentions, topics: v.topics }))
    .sort((a, b) => b.mentions - a.mentions);
  const topCompetitor = competitors[0]?.brand ?? null;

  // ---- Verdict copy ----
  const f = (n: number) => Math.round(n).toLocaleString('en-IN');
  let headline: string;
  let subhead: string;
  if (gaps.length && topCompetitor) {
    headline =
      `${prospectName} is missing from AI answers for ${f(gaps.length)} high-intent ${vertical} ` +
      `topics worth ~${f(totalGapVolume)} monthly searches — while ${topCompetitor} is already being cited.`;
    const lead = categoryExposure[0];
    subhead = lead
      ? `Biggest exposure: ${lead.category} (${f(lead.missedVolume)} searches across ${lead.gapCount} topics, led by ${lead.topCompetitor}). ` +
        (primary
          ? `Today ${prospectName} appears for ${f(primary.topicsInVertical)} ${vertical} topics with ${f(primary.totalMentions)} AI mentions and avg visibility ${primary.avgVisibility}.`
          : '')
      : '';
  } else if (primary) {
    headline =
      `${prospectName} appears for ${f(primary.topicsInVertical)} ${vertical} topics in AI answers ` +
      `(${f(primary.totalMentions)} mentions, avg visibility ${primary.avgVisibility}).`;
    subhead = 'Upload the gap_topics export to surface the high-volume topics where competitors are cited and you are not.';
  } else {
    headline = `Couldn't compute a snapshot for ${prospectName} — check the uploaded files.`;
    subhead = warnings.join(' ');
  }

  return {
    prospectName,
    vertical,
    generatedAt: new Date().toISOString(),
    ownThreshold,
    primary,
    headline,
    subhead,
    gaps: gaps.slice(0, 12), // one-pager — keep the reel tight
    gapCount: gaps.length,
    totalGapVolume,
    categoryExposure: categoryExposure.slice(0, 6),
    competitors: competitors.slice(0, 6),
    topCompetitor,
    warnings,
  };
}

// Re-export so callers building a snapshot can flag beauty-brand topics if they
// want to (kept here to mirror the WBR's surface and avoid deep imports).
export { isBeautyBrand };

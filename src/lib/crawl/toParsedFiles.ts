// The adapter seam: turn measurement metrics into the SAME ParsedFile shape the
// SEMrush CSV parser produces, so buildSnapshot()/buildReport() consume live
// crawl data with zero changes.

import type { ParsedFile, TopicRow, SourceRow } from '../wbr/parse';
import type { BrandRef, Extraction, PromptSet, TopicMetric } from './types';

// Host key for a brand, used in gap_mentions (snapshot matches primary via
// host.includes(primaryKey), and labels competitors via hostLabel()).
function brandHost(b: BrandRef): string {
  return b.aliases.find((a) => a.includes('.')) ?? `${b.key}.com`;
}

export function toParsedFiles(
  set: PromptSet, metrics: TopicMetric[], extractions: Extraction[],
): ParsedFile[] {
  const primary = set.primary;
  const brands = [primary, ...set.competitors];

  // ---- gap_topics for the primary brand (carries per-competitor mentions) ----
  const gapTopics: TopicRow[] = metrics.map((m) => {
    const gapMentions: Record<string, number> = {};
    for (const b of brands) {
      const pb = m.perBrand[b.key];
      gapMentions[brandHost(b)] = pb.mentions;
    }
    const pp = m.perBrand[primary.key];
    return {
      name: m.topic,
      visibility: pp.visibility,
      difficulty: 0,
      mentions: pp.mentions,
      volume: m.volume,
      gapMentions,
    };
  });

  // ---- brand_topics for the primary (footprint) ----
  const brandTopics: TopicRow[] = metrics.map((m) => {
    const pp = m.perBrand[primary.key];
    return { name: m.topic, visibility: pp.visibility, difficulty: 0, mentions: pp.mentions, volume: m.volume };
  });

  // ---- sources: the primary brand's cited pages, with prompt counts ----
  const urlCounts = new Map<string, number>();
  for (const e of extractions) {
    for (const url of e.citedByBrand[primary.key] ?? []) {
      urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
    }
  }
  const sources: SourceRow[] = [...urlCounts.entries()].map(([url, promptsCount]) => ({ url, promptsCount }));

  return [
    { fileName: `brand_topics_${primary.key}.csv`, type: 'brand_topics', brand: primary.key, topics: brandTopics },
    { fileName: `gap_topics_${primary.key}.csv`, type: 'gap_topics', brand: primary.key, topics: gapTopics },
    { fileName: `sources_${primary.key}.csv`, type: 'sources', brand: primary.key, sources },
  ];
}

// Aggregate per-response extractions into per (brand x topic) metrics, then into
// a transparent AEO score. This is the antidote to the two SEMrush weaknesses we
// can fix in scoring: noise-filtering (handled upstream by the prompt set being
// in-vertical) and citation visibility (we keep mention vs citation separate).

import { classifyTopic } from '../wbr/categorize';
import type { AeoScore, BrandRef, Extraction, PromptSet, TopicMetric } from './types';

function round1(n: number): number { return Math.round(n * 10) / 10; }

export function aggregate(
  set: PromptSet, extractions: Extraction[],
): TopicMetric[] {
  const brands = [set.primary, ...set.competitors];
  const byTopic = new Map<string, Extraction[]>();
  for (const e of extractions) {
    const arr = byTopic.get(e.topic) ?? [];
    arr.push(e);
    byTopic.set(e.topic, arr);
  }

  const out: TopicMetric[] = [];
  for (const t of set.topics) {
    const es = byTopic.get(t.topic) ?? [];
    const N = es.length || 1;
    const category = t.category
      ?? classifyTopic(t.topic, { vertical: set.vertical }).category;

    const perBrand: TopicMetric['perBrand'] = {};
    for (const b of brands) {
      let respMentioning = 0; let mentions = 0; let cited = 0;
      let rankSum = 0; let rankCount = 0;
      for (const e of es) {
        if (e.mentioned[b.key]) { respMentioning++; mentions += e.hits[b.key] ?? 0; }
        if (e.rank[b.key]) { rankSum += e.rank[b.key]; rankCount++; }
        if ((e.citedByBrand[b.key]?.length ?? 0) > 0) cited++;
      }
      perBrand[b.key] = {
        visibility: round1((respMentioning / N) * 100),
        mentions,
        responsesMentioning: respMentioning,
        citationRate: round1(cited / N),
        avgRank: rankCount ? round1(rankSum / rankCount) : null,
      };
    }
    out.push({ topic: t.topic, category, volume: t.volume ?? 0, responses: es.length, perBrand });
  }
  return out;
}

// ---- Transparent AEO score (published formula — the anti-black-box) ----
const WEIGHTS = { presence: 0.4, coverage: 0.25, citation: 0.2, prominence: 0.15 };

function grade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

export function scoreBrands(set: PromptSet, metrics: TopicMetric[]): AeoScore[] {
  const brands = [set.primary, ...set.competitors];
  const T = metrics.length || 1;
  // Max rank used to normalise prominence (how many brands could be named).
  const maxRank = brands.length;

  const scores: AeoScore[] = brands.map((b) => {
    let visSum = 0; let covered = 0; let citSum = 0;
    let promSum = 0; let promCount = 0;
    for (const m of metrics) {
      const pb = m.perBrand[b.key];
      visSum += pb.visibility;
      if (pb.responsesMentioning > 0) covered++;
      citSum += pb.citationRate * 100;
      if (pb.avgRank != null) {
        // rank 1 -> 100, rank maxRank -> ~0
        promSum += Math.max(0, 100 * (1 - (pb.avgRank - 1) / Math.max(1, maxRank - 1)));
        promCount++;
      }
    }
    const presence = round1(visSum / T);
    const coverage = round1((covered / T) * 100);
    const citation = round1(citSum / T);
    const prominence = round1(promCount ? promSum / promCount : 0);
    const score = round1(
      presence * WEIGHTS.presence + coverage * WEIGHTS.coverage +
      citation * WEIGHTS.citation + prominence * WEIGHTS.prominence,
    );
    return {
      brand: b.label, key: b.key, score, grade: grade(score),
      components: { presence, coverage, citation, prominence },
      weights: WEIGHTS,
    };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores;
}

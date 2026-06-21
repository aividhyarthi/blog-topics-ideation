// The Reveal — turn raw responses into the "here's what the AI actually says"
// layer: per topic, the most dramatic verbatim answer (primary absent while a
// competitor is named), plus citation forensics (which sources made them win).

import { brandForHost, classifySource, hostOf } from './extract';
import type {
  Extraction, MeasureResult, PromptSet, RawResponse, Reveal, RevealCitation,
} from './types';

function presence(set: PromptSet, extractions: Extraction[]): Map<string, number> {
  const N = extractions.length || 1;
  const m = new Map<string, number>();
  for (const b of [set.primary, ...set.competitors]) {
    let c = 0;
    for (const e of extractions) if (e.mentioned[b.key]) c++;
    m.set(b.key, Math.round((c / N) * 100));
  }
  return m;
}

export function buildHeadline(set: PromptSet, extractions: Extraction[]): MeasureResult['headline'] {
  const pres = presence(set, extractions);
  let topCompetitor: string | null = null;
  let topVal = -1;
  for (const c of set.competitors) {
    const v = pres.get(c.key) ?? 0;
    if (v > topVal) { topVal = v; topCompetitor = c.label; }
  }
  return {
    primaryLabel: set.primary.label,
    primaryPresence: pres.get(set.primary.key) ?? 0,
    topCompetitor,
    topCompetitorPresence: topVal < 0 ? 0 : topVal,
  };
}

export function buildReveals(
  set: PromptSet, responses: RawResponse[], extractions: Extraction[],
): Reveal[] {
  const brands = [set.primary, ...set.competitors];
  const byTopic = new Map<string, { r: RawResponse; e: Extraction }[]>();
  responses.forEach((r, i) => {
    const arr = byTopic.get(r.topic) ?? [];
    arr.push({ r, e: extractions[i] });
    byTopic.set(r.topic, arr);
  });

  // Most dramatic = primary absent AND the most competitors present.
  const drama = ({ e }: { e: Extraction }) => {
    const primAbsent = e.mentioned[set.primary.key] ? 0 : 1;
    const comps = set.competitors.reduce((s, c) => s + (e.mentioned[c.key] ? 1 : 0), 0);
    return primAbsent * 100 + comps;
  };

  const reveals: Reveal[] = [];
  for (const t of set.topics) {
    const items = byTopic.get(t.topic) ?? [];
    if (!items.length) continue;
    const best = [...items].sort((a, b) => drama(b) - drama(a))[0];
    const { r, e } = best;

    const mentions = brands.map((b) => ({
      label: b.label, key: b.key, isPrimary: b.key === set.primary.key,
      present: Boolean(e.mentioned[b.key]), rank: e.rank[b.key] ?? null,
    }));

    const citations: RevealCitation[] = r.citations.map((c) => {
      const host = hostOf(c.url);
      const bk = brandForHost(host, brands);
      return { url: c.url, host, type: classifySource(host), brand: bk ? (brands.find((b) => b.key === bk)?.label ?? null) : null };
    });

    let winner: string | null = null;
    let wr = Infinity;
    for (const m of mentions) if (m.present && m.rank != null && m.rank < wr) { wr = m.rank; winner = m.label; }

    reveals.push({
      topic: t.topic, prompt: r.prompt, engine: r.engine,
      answer: r.text, mentions, citations,
      primaryPresent: Boolean(e.mentioned[set.primary.key]), winner,
    });
  }
  // Lead with the topics that sting most (primary absent, a competitor present).
  reveals.sort((a, b) => {
    const s = (x: Reveal) => (x.primaryPresent ? 0 : 1) * 100 + x.mentions.filter((m) => !m.isPrimary && m.present).length;
    return s(b) - s(a);
  });
  return reveals;
}

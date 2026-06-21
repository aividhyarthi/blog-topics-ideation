// Orchestrator: run a frozen prompt set through the engine, extract, aggregate,
// score, and emit both the AEO scorecard and the ParsedFile[] that feeds the
// Snapshot. Phase 1 = Perplexity (live) or deterministic demo (no key).

import { collect } from './engines';
import { extract } from './extract';
import { aggregate, scoreBrands } from './aggregate';
import { buildHeadline, buildReveals } from './reveal';
import { toParsedFiles } from './toParsedFiles';
import type { ParsedFile } from '../wbr/parse';
import type { Extraction, MeasureResult, PromptSet } from './types';

export async function runMeasurement(
  set: PromptSet,
): Promise<{ result: MeasureResult; parsedFiles: ParsedFile[] }> {
  // Pick the live engine from whichever API key is set (else demo).
  const { mode, engine, responses } = await collect(set);
  // If every live call errored (bad key / no web search / network), surface it.
  const erroredAll = mode === 'live' && responses.length > 0 && responses.every((r) => r.text.startsWith('__error__'));
  const notice = erroredAll ? responses[0].text.replace('__error__ ', '') : null;

  const extractions: Extraction[] = responses.map((r) => extract(r, set.primary, set.competitors));
  const topicMetrics = aggregate(set, extractions);
  const scorecard = scoreBrands(set, topicMetrics);
  const parsedFiles = toParsedFiles(set, topicMetrics, extractions);

  // The Reveal: verbatim answers + citation forensics + the hero number.
  const headline = buildHeadline(set, extractions);
  const reveals = buildReveals(set, responses, extractions);
  const brands = [set.primary, ...set.competitors].map((b) => ({
    label: b.label, key: b.key, aliases: b.aliases, isPrimary: b.key === set.primary.key,
  }));

  const promptCount = set.topics.reduce((s, t) => s + t.prompts.length, 0);

  const result: MeasureResult = {
    mode,
    engine,
    notice,
    generatedAt: new Date().toISOString(),
    set: {
      client: set.client, vertical: set.vertical, locale: set.locale,
      runsPerPrompt: set.runsPerPrompt, topics: set.topics.length, prompts: promptCount,
    },
    headline,
    reveals,
    brands,
    scorecard,
    topicMetrics,
  };
  return { result, parsedFiles };
}

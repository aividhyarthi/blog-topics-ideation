// Orchestrator: run a frozen prompt set through the engine, extract, aggregate,
// score, and emit both the AEO scorecard and the ParsedFile[] that feeds the
// Snapshot. Phase 1 = Perplexity (live) or deterministic demo (no key).

import { collectPerplexity } from './engines/perplexity';
import { extract } from './extract';
import { aggregate, scoreBrands } from './aggregate';
import { toParsedFiles } from './toParsedFiles';
import type { ParsedFile } from '../wbr/parse';
import type { Extraction, MeasureResult, PromptSet } from './types';

export async function runMeasurement(
  set: PromptSet,
): Promise<{ result: MeasureResult; parsedFiles: ParsedFile[] }> {
  // Phase 1 only wires Perplexity; the structure allows more engines later.
  const { mode, responses } = await collectPerplexity(set);

  const extractions: Extraction[] = responses.map((r) => extract(r, set.primary, set.competitors));
  const topicMetrics = aggregate(set, extractions);
  const scorecard = scoreBrands(set, topicMetrics);
  const parsedFiles = toParsedFiles(set, topicMetrics, extractions);

  // A few sample responses for the "show your work" panel (trust > black box).
  const sampleResponses = responses.slice(0, 3).map((r) => ({
    topic: r.topic, prompt: r.prompt, text: r.text.slice(0, 600),
    citations: r.citations.map((c) => c.url).slice(0, 5),
  }));

  const promptCount = set.topics.reduce((s, t) => s + t.prompts.length, 0);

  const result: MeasureResult = {
    mode,
    engine: 'perplexity',
    generatedAt: new Date().toISOString(),
    set: {
      client: set.client, vertical: set.vertical, locale: set.locale,
      runsPerPrompt: set.runsPerPrompt, topics: set.topics.length, prompts: promptCount,
    },
    scorecard,
    topicMetrics,
    sampleResponses,
  };
  return { result, parsedFiles };
}

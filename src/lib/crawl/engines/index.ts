// Engine dispatch: pick the live engine based on which API key is configured,
// else fall back to the deterministic demo generator. Preference order favors
// engines with the cleanest native citations.
import { collectPerplexity, perplexityKey } from './perplexity';
import { collectOpenAI, openaiKey } from './openai';
import { collectAnthropic, anthropicKey } from './anthropic';
import type { Engine, PromptSet, RawResponse } from '../types';

export async function collect(
  set: PromptSet,
): Promise<{ mode: 'live' | 'demo'; engine: Engine; responses: RawResponse[] }> {
  if (perplexityKey()) {
    const { responses } = await collectPerplexity(set);
    return { mode: 'live', engine: 'perplexity', responses };
  }
  if (openaiKey()) {
    return { mode: 'live', engine: 'openai', responses: await collectOpenAI(set) };
  }
  if (anthropicKey()) {
    return { mode: 'live', engine: 'anthropic', responses: await collectAnthropic(set) };
  }
  // No key configured anywhere -> deterministic demo.
  const { responses } = await collectPerplexity(set);
  return { mode: 'demo', engine: 'perplexity', responses };
}

export const ENGINE_LABEL: Record<Engine, string> = {
  perplexity: 'Perplexity',
  openai: 'OpenAI',
  anthropic: 'Claude',
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  aio: 'AI Overviews',
};

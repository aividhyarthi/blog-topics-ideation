// Prompt-set construction. A FROZEN, category-level set of buyer questions —
// the same questions are asked for every brand so visibility is comparable and
// week-over-week trends are stable (the fix to SEMrush's churning prompt panel).
//
// These are brand-AGNOSTIC category prompts: we measure who the AI names when a
// real buyer asks. Replace/extend per client with their own customer questions
// (support tickets, site search, sales calls) — that's what makes it non-synthetic.

import { brandFromName } from '../wbr/parse';
import type { BrandRef, PromptSet, PromptTopic } from './types';

const BEAUTY_STARTER: PromptTopic[] = [
  { topic: 'Vitamin C Serum', category: 'Skincare', intent: 'commercial', prompts: [
    'best vitamin C serum in India',
    'which vitamin C serum should I buy for glowing skin',
  ] },
  { topic: 'Sunscreen', category: 'Skincare', intent: 'commercial', prompts: [
    'best sunscreen for oily skin in India',
    'which sunscreen brand do dermatologists recommend in India',
  ] },
  { topic: 'Liquid Lipstick', category: 'Lips', intent: 'commercial', prompts: [
    'best long lasting liquid lipstick in India',
    'top liquid lipstick brands for Indian skin tones',
  ] },
  { topic: 'Foundation', category: 'Face Makeup', intent: 'commercial', prompts: [
    'best foundation for oily skin in India',
    'which foundation gives full coverage for Indian skin',
  ] },
  { topic: 'Shampoo for Hair Fall', category: 'Hair Care', intent: 'commercial', prompts: [
    'best shampoo for hair fall in India',
    'which anti hairfall shampoo actually works',
  ] },
  { topic: 'Perfume', category: 'Fragrance', intent: 'commercial', prompts: [
    'best long lasting perfume for women in India',
    'affordable perfume brands that last all day in India',
  ] },
];

const STARTERS: Record<'beauty' | 'fashion', PromptTopic[]> = {
  beauty: BEAUTY_STARTER,
  fashion: BEAUTY_STARTER, // placeholder until a fashion starter is curated
};

export function toBrandRef(label: string, domain?: string): BrandRef {
  const key = brandFromName(label);
  const aliases = new Set<string>([label.toLowerCase().trim(), key]);
  if (domain) aliases.add(domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''));
  else aliases.add(`${key}.com`);
  return { key, label: label.trim(), aliases: [...aliases] };
}

export interface BuildSetInput {
  client: string;
  vertical: 'beauty' | 'fashion';
  locale?: string;
  runsPerPrompt?: number;
  primaryLabel: string;
  primaryDomain?: string;
  competitors: { label: string; domain?: string }[];
  topics?: PromptTopic[]; // override the starter set with the client's own
}

export function buildPromptSet(input: BuildSetInput): PromptSet {
  return {
    client: input.client,
    vertical: input.vertical,
    locale: input.locale || 'en-IN',
    engines: ['perplexity'],
    runsPerPrompt: Math.min(Math.max(input.runsPerPrompt ?? 3, 1), 5),
    primary: toBrandRef(input.primaryLabel, input.primaryDomain),
    competitors: input.competitors.filter((c) => c.label?.trim()).map((c) => toBrandRef(c.label, c.domain)),
    topics: input.topics?.length ? input.topics : STARTERS[input.vertical],
  };
}

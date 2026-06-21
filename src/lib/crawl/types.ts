// Live AEO measurement — shared types.
//
// Phase 1 of the DIY visibility engine (see docs/architecture/diy-visibility-
// engine.md). The crawl queries an AI engine live for a FROZEN prompt set,
// extracts brand mentions + citations, scores them, and emits the same
// ParsedFile shape the SEMrush exports produce so /snapshot consumes it
// unchanged. Built Perplexity-first; runs in deterministic demo mode with no
// API key so the whole pipeline is exercisable offline.

export type Engine = 'perplexity' | 'gemini' | 'chatgpt' | 'aio';

export interface BrandRef {
  key: string;     // canonical short key, e.g. "sugar" (matches host substrings)
  label: string;   // display name, e.g. "SUGAR Cosmetics"
  aliases: string[]; // name variants + domain, e.g. ["sugar cosmetics","sugarcosmetics.com"]
}

export interface PromptTopic {
  topic: string;            // -> TopicRow.name (a cluster of prompts)
  category?: string;        // optional taxonomy hint
  intent?: 'informational' | 'commercial' | 'navigational';
  volume?: number;          // monthly search volume if known (else 0 — see spec §6)
  prompts: string[];        // the actual buyer questions
}

export interface PromptSet {
  client: string;
  vertical: 'beauty' | 'fashion';
  locale: string;           // e.g. "en-IN"
  engines: Engine[];        // Phase 1: ['perplexity']
  runsPerPrompt: number;    // 2–5; smooths LLM stochasticity
  primary: BrandRef;
  competitors: BrandRef[];
  topics: PromptTopic[];
}

export interface Citation { url: string; title?: string; }

export interface RawResponse {
  topic: string;
  prompt: string;
  engine: Engine;
  run: number;
  text: string;
  citations: Citation[];
  ts: string;
}

// Per-response extraction: who was mentioned, in what order, who was cited.
export interface Extraction {
  topic: string;
  prompt: string;
  engine: Engine;
  run: number;
  mentioned: Record<string, boolean>; // brandKey -> mentioned in text
  hits: Record<string, number>;       // brandKey -> mention count
  rank: Record<string, number>;       // brandKey -> 1-based order of first appearance
  citedHosts: Record<string, number>; // host -> citation count in this response
  citedByBrand: Record<string, string[]>; // brandKey -> cited URLs belonging to it
}

// Per (brand x topic) aggregate.
export interface TopicMetric {
  topic: string;
  category: string;
  volume: number;
  responses: number;            // N = prompts*runs*engines for this topic
  perBrand: Record<string, {
    visibility: number;         // 0-100 share of voice
    mentions: number;
    responsesMentioning: number;
    citationRate: number;       // 0-1
    avgRank: number | null;     // avg position when mentioned (lower = better)
  }>;
}

// Transparent AEO score for one brand (the differentiator vs SEMrush's black box).
export interface AeoScore {
  brand: string;        // label
  key: string;
  score: number;        // 0-100
  grade: string;        // A+ .. F
  components: {
    presence: number;   // 0-100  avg visibility across covered topics
    coverage: number;   // 0-100  % of topics the brand appears in at all
    citation: number;   // 0-100  avg citation rate
    prominence: number; // 0-100  position quality when mentioned
  };
  weights: Record<string, number>; // published, so it's auditable
}

// ---- The Reveal: the verbatim "here's what the AI actually says" layer ----
export interface RevealMention {
  label: string;
  key: string;
  isPrimary: boolean;
  present: boolean;
  rank: number | null; // order named in the answer (1 = first)
}
export interface RevealCitation {
  url: string;
  host: string;
  type: string;        // classified source type (Reddit / Blog / Marketplace …)
  brand: string | null; // brand label this source belongs to, if any
}
export interface Reveal {
  topic: string;
  prompt: string;
  engine: Engine;
  answer: string;            // full verbatim AI answer
  mentions: RevealMention[];
  citations: RevealCitation[];
  primaryPresent: boolean;
  winner: string | null;     // brand named first in this answer
}

export interface MeasureResult {
  mode: 'live' | 'demo';
  engine: Engine;
  generatedAt: string;
  set: { client: string; vertical: string; locale: string; runsPerPrompt: number; topics: number; prompts: number };
  // Hero number — the gut-punch comparison.
  headline: {
    primaryLabel: string;
    primaryPresence: number;       // 0-100 across all responses
    topCompetitor: string | null;
    topCompetitorPresence: number; // 0-100
  };
  reveals: Reveal[];               // verbatim answers, brand-highlightable
  brands: { label: string; key: string; aliases: string[]; isPrimary: boolean }[];
  scorecard: AeoScore[];           // primary + competitors, ranked
  topicMetrics: TopicMetric[];
}

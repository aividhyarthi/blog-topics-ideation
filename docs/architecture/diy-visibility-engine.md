# CiteRank — DIY Prompt-Set Visibility Engine (spec)

**Goal:** measure "how is a brand ranking in LLMs?" from our own prompt-set crawl, and emit the **exact same normalized data** the SEMrush exports produce — so the existing `buildSnapshot()` / `buildReport()` engines consume it with **zero changes**.

This is the "own-crawl" half of the hybrid data strategy. SEMrush funds it; this de-risks the dependency and unlocks selling to prospects who don't have SEMrush.

---

## 0. The one design rule: emit the existing shape

Everything downstream already speaks one language — `ParsedFile` from `src/lib/wbr/parse.ts`:

```ts
type FileType = 'brand_topics' | 'gap_topics' | 'sources';

interface TopicRow {
  name: string;          // topic label (a cluster of prompts)
  visibility: number;    // 0–100 share-of-voice for this brand on this topic
  difficulty: number;    // optional; 0 if unknown
  mentions: number;      // total brand mentions across this topic's responses
  volume: number;        // monthly search demand (see §6 — needs a volume source)
  gapMentions?: Record<string, number>; // host -> mentions (per-competitor)
  intents?: Record<string, number>;
}
interface SourceRow { url: string; promptsCount: number; }
interface ParsedFile { fileName: string; type: FileType; brand: string;
                       topics?: TopicRow[]; sources?: SourceRow[]; }
```

**The crawl's only job is to produce `ParsedFile[]` in this shape.** Both data sources then look identical to the report layer:

```ts
interface VisibilitySource {
  // brand = primary brand key; competitors derived from the data as today.
  collect(client: ClientConfig, week: string): Promise<ParsedFile[]>;
}
// SemrushCsvSource  -> parses uploaded CSVs (today)
// PromptCrawlSource -> this spec (new)
```

`buildSnapshot` / `buildReport` never know which source produced the data.

---

## 1. Pipeline overview

```
Prompt set (config, frozen per client)
   └─► [1] Collect: query each engine, N runs per prompt, cache raw
        └─► [2] Extract: per response → mentions, citations, competitors
             └─► [3] Aggregate: per (brand × topic) → visibility, mentions, gapMentions, sources
                  └─► [4] Emit: ParsedFile[] (brand_topics, gap_topics, sources)
                       └─► buildSnapshot() / buildReport()  (unchanged)
```

---

## 2. Stage 1 — Prompt set (config, frozen)

The prompt set defines the universe of "how the buyer asks." **Frozen per client** the same way taxonomy mappings are frozen — change the prompts and week-over-week trends break.

```ts
interface PromptSet {
  client: string;
  locale: string;                 // 'en-IN', etc.
  engines: Engine[];              // which engines to query
  runsPerPrompt: number;          // 3–5; smooths LLM stochasticity
  topics: PromptTopic[];
}
interface PromptTopic {
  topic: string;                  // -> TopicRow.name
  category?: string;              // optional hint for the taxonomy engine
  volume?: number;                // monthly search volume if known (see §6)
  intent?: 'informational' | 'commercial' | 'navigational';
  prompts: string[];              // the actual buyer questions
}
type Engine = 'perplexity' | 'gemini' | 'chatgpt' | 'aio';
```

**Seeding the prompt set:** from the client's keywords + competitor names + intent patterns (`best <X>`, `<X> vs <Y>`, `is <X> good`, `<X> for <need>`, `top <category> brands in <locale>`). 50–150 prompts grouped into 15–40 topics is plenty for v1.

---

## 3. Stage 2 — Collect (query the engines)

For each `(prompt, engine, run)`: call the engine, store the **raw response + native citations**, cache by hash so re-runs are free and results are auditable (defensibility).

```ts
interface RawResponse {
  promptId: string; topic: string; engine: Engine; run: number;
  text: string;
  citations: { url: string; title?: string }[]; // native where available
  ts: string;
}
```

**Engine notes (pick order matters — start with the easy, ToS-clean ones):**

| Engine | How | Citations | ToS / cost | Priority |
|---|---|---|---|---|
| **Perplexity** | Official API | Returned natively | Clean, cheap | **1 (start here)** |
| **Gemini** | Official API + Google Search grounding | Grounding metadata | Clean | 2 |
| **ChatGPT** | OpenAI Responses API + `web_search` tool | In tool results / annotations | Clean | 3 |
| **Google AI Overviews** | **No official API** → use a SERP data provider (DataForSEO / SerpAPI) | Provider returns AIO block + links | Paid per query; provider handles compliance. **Do not scrape Google directly** (ToS, fragile). | 4 (later) |

> v1 = Perplexity only. It returns citations natively, so you get both mention-rate and citation data from one clean API. That alone produces a real Snapshot for any brand without SEMrush.

**Determinism controls (the ghost-citation fix):**
- `temperature: 0` where the API allows.
- `runsPerPrompt` 3–5 and aggregate by **rate**, not single answers.
- Freeze the prompt set; snapshot raw responses each week.

---

## 4. Stage 3 — Extract (per response)

```ts
interface Extraction {
  promptId: string; topic: string; engine: Engine; run: number;
  primaryMentioned: boolean;
  brandHits: Record<string, number>;   // brandKey -> mention count in text
  brandRank: Record<string, number>;   // brandKey -> order of first appearance
  citedHosts: Record<string, number>;  // host -> # of citations in this response
}
```

- **Mention detection:** match brand + alias list against the answer text. Reuse the word-boundary matcher from `categorize.ts` (`hasKeyword`) so "Plum" doesn't match "plumber". Maintain a per-client `aliases` map (brand → name variants, .com, common misspellings).
- **Competitor detection:** same matcher over the competitor brand list.
- **Citations:** from native citation metadata (Perplexity/Gemini/ChatGPT) or, for AIO, the SERP provider's links. Map each cited URL → host → brand (own / competitor / third-party).
- **Rank/position (optional):** order brands by first appearance for position-weighted visibility.
- **Sentiment/recommendation (optional, later):** an LLM-as-judge pass — is the brand *recommended* vs merely named. Keep out of v1.

---

## 5. Stage 4 — Aggregate → metrics (the scoring)

Per `(brand × topic)`, over all that topic's responses (`N = prompts_in_topic × engines × runs`):

```
visibility(brand, topic) = 100 * (responses_mentioning_brand / N)
mentions(brand, topic)   = Σ brandHits over the topic's responses
```

Optional **position-weighted** visibility (rewards being named first):
```
weight(rank) = 1 / rank            // rank 1 -> 1.0, rank 2 -> 0.5, ...
visibility   = 100 * Σ weight(rank_in_response) / N
```

- **`gapMentions`** for a topic = `{ competitorHost: mentions }` for every brand seen on it (incl. primary) → feeds the Snapshot gap reel and the WBR gap/brand-comparison sections directly.
- **`sources`** (cited pages) = aggregate `citedHosts`/URLs for the brand; `promptsCount` = # of responses that cited that URL → feeds the cited-source page-type mix.
- **`difficulty`** = optional; can derive from how concentrated the topic is among few brands (high = hard to break in). 0 if unused.

**Citation rate** is a distinct, valuable metric (separate from mention rate):
```
citationRate(brand) = responses_citing_brand_domain / N
```
Surface it explicitly — it's the lever for "the model knows you but doesn't cite your content."

---

## 6. The volume problem (be honest about this)

SEMrush's `volume` is real monthly **search** demand — the crawl doesn't produce it. Options, in order of preference:
1. **Enrich from a keyword volume API** (SEMrush keyword API, Google Keyword Planner, DataForSEO) keyed on the topic seed term. Best.
2. **Use AI prompt-volume** if the SERP/AIO provider exposes it.
3. **Omit/estimate** and label the column "Coverage" instead of search volume in DIY-only reports. Honest, still useful for prioritisation (gap *frequency* in your own prompt set).

Don't fake a search volume — it undermines the trust that is the whole product.

---

## 7. Suggested code layout

```
src/lib/crawl/
  types.ts          // PromptSet, RawResponse, Extraction, ClientConfig
  promptset.ts      // load/validate a client's frozen prompt set
  engines/
    perplexity.ts   // collect() per engine — start here
    gemini.ts
    chatgpt.ts
    aio.ts          // via SERP provider
  collect.ts        // orchestrate prompt × engine × run, with caching
  extract.ts        // response -> Extraction (reuses categorize.hasKeyword)
  aggregate.ts      // Extraction[] -> metrics per (brand × topic)
  toParsedFiles.ts  // metrics -> ParsedFile[]  (the adapter seam)
src/lib/sources.ts  // VisibilitySource interface; SemrushCsvSource + PromptCrawlSource
```

The reports stay exactly as they are — they only ever see `ParsedFile[]`.

---

## 8. Cost model (sanity check — it's cheap)

`calls = prompts × engines × runs`. Example: **75 prompts × 3 engines × 3 runs = 675 calls/week/client.**
- LLM API tokens for 675 short Q&A calls ≈ a few dollars/week.
- AIO via a SERP provider adds per-query cost (the main expense; defer to phase 3).
- The real cost is **engineering + prompt-set curation + maintenance** (engines change), which is exactly why SEMrush (Option A) funds this (Option B). Fits the <$1k/mo constraint at low client counts.

---

## 9. Phasing (slot into the MVP, don't block it)

| Phase | Scope | Outcome |
|---|---|---|
| **1** | Perplexity-only, 1–3 runs, emit `gap_topics` + `sources` shape | A real **Snapshot** for any brand, no SEMrush needed |
| **2** | + Gemini + ChatGPT, multi-run rate aggregation, position weighting | Full mention + citation metrics; trustworthy weekly trend |
| **3** | + AI Overviews via SERP provider, + volume enrichment | Parity with SEMrush coverage; can drop SEMrush where you want |

---

## 10. Limitations to state to clients (trust > hype)

- **Stochasticity** is real — that's why we run N times and report rates, not single answers.
- **AI Overviews** has no clean API; we use a compliant SERP provider, not scraping.
- **Generic brand names** are hard to disambiguate — handled via per-client alias lists + context matching, but flag low-confidence.
- **It's our prompt set, not the whole internet** — visibility is "across the questions your buyers actually ask," which we curate with you. That's a feature (relevance), stated as a limitation (not exhaustive).

---

*Pairs with the productization plan: this is the engine behind "how am I ranking in LLMs?" The free Snapshot (`/snapshot`) is its first consumer; the weekly pilot report is its second. Both already speak `ParsedFile`, so this slots in behind them.*

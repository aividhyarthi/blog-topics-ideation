# Nykaa AEO Blog Topic Engine

A self-contained web tool that turns **category/product URLs**, **seed keywords**, and
**SEMrush / LLM prompts** into ready-to-use **blog topic ideas** designed to rank in
Answer Engine Optimization (AEO) and be cited inside LLM answers (ChatGPT, Gemini,
Perplexity, Google AI Overviews).

Built for the Nykaa content team, but the brand is configurable in the UI.

## What it does

1. You paste three things into three boxes:
   - **URLs** — the Nykaa category pages and product (PDP) pages you write content around.
   - **Keywords** — seed keywords from SEMrush or your own research.
   - **Prompts** — the natural-language questions/prompts people ask (e.g. SEMrush's prompt data).
2. The server **best-effort crawls** each URL (browser-like request) and extracts the
   title, meta description, headings, and a chunk of visible content/review text.
   Nykaa is JS-heavy and may block or under-serve bots — when a page returns little
   content, the tool falls back to inferring intent from the URL slug + your keywords,
   and tells you which pages that happened for.
3. Claude generates **15–20 blog topics**, each with:
   - **Category** — topic cluster / Nykaa category
   - **Blog Title** — human, specific headline
   - **Focus Keyword** — primary SEO keyword
   - **Target Prompt / Question** — the exact question an LLM user would ask that this blog should be the cited answer to
   - **Intent** — informational / commercial / comparison / transactional / how-to
   - **Why it ranks in LLMs** — short rationale + tie-back to a Nykaa page
4. **Copy table** (paste straight into Excel/Google Sheets) or **Download Excel (CSV)**.

## AEO Auditor (`/audit`) — newsroom copilot

A second tool in the same app that **scores a finished article** for how likely
it is to be cited by LLM answer engines (ChatGPT, Perplexity, Gemini, Google AI
Overviews). Audit a **live URL** (it crawls the page) or **paste the article
HTML/plain text**, and pick a **category** for the right weighting.

It produces a 0–100 score, a letter grade, a **citation-likelihood band**
(Low/Medium/High), an **advisory publish gate**, a **prompt-coverage** list, and
a ranked list of fixes.

### Six editor-controllable pillars

The score grades only what an editor can change before publishing. Off-page
brand authority (the strongest *real* driver of citation) is reported separately
as **domain context** and is **not** in the score, because it's the same for
every article on a site.

| Pillar | Purpose |
| ------ | ------- |
| Answerability | Can an AI extract the answer fast? (headline clarity, lead completeness, answer-above-the-fold, direct answers, conciseness) |
| Entity Clarity | Are entities explicit & consistent? (named-entity density, low pronoun dependency, canonical naming) |
| Attribution & Trust | Can an AI trust the claims? (named sources vs "experts say", claim attribution, citations, statistics, quotations, author) |
| Structural Readability | Is it machine-readable? (summary block, Q&A structure, scannability, reading ease) |
| Query Matchability | Does it mirror how users ask AI? (prompt coverage, conversational/long-tail intent) |
| Freshness & Metadata | Is it timely & marked up? (updated timestamp, category schema, title/meta) |

### Category-specific weighting

Pillar weights change by category (`CATEGORY_WEIGHTS` in `src/lib/aeo.ts`):
Health is Attribution-dominant (E-E-A-T), Breaking News is Freshness-dominant,
Entertainment is Entity/Answerability-dominant, Lifestyle is Query-dominant, etc.

Most signals are scored **deterministically** by parsing the HTML
(`src/lib/aeo.ts`); judgement/estimate calls (answer quality, entity
consistency, attribution, prompt coverage, off-page estimate) go to Claude in
`src/pages/api/aeo-audit.ts`. The tool predicts *page-level citability* — it does
not measure *actual* Share of Voice across prompts (what Semrush/Profound sell),
and citation behaviour varies per engine, so treat the score as one composite
signal. The publish gate is advisory; real publish-blocking would be a CMS
integration.

## Tech

- [Astro](https://astro.build) (server output, Node adapter)
- [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) → Claude (`claude-sonnet-4-6`)
- Deployed on Railway via the included `Dockerfile` / `railway.json`

## Environment variables

| Variable             | Required | Notes                                  |
| -------------------- | -------- | -------------------------------------- |
| `ANTHROPIC_API_KEY`  | yes      | Server-side Claude key. Never exposed to the browser. |
| `PORT`               | no       | Defaults to `4321` (set by Railway).   |

## Run locally

```bash
cd nykaa-blog-engine
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev          # http://localhost:4321
```

Production build:

```bash
npm run build
npm start
```

## Deploy to Railway (separate project)

This tool is intentionally independent of the other tools in this repo.

1. Create a **new** Railway project/service.
2. Point it at this repo and set the **root directory** to `nykaa-blog-engine`
   (so Railway uses this folder's `Dockerfile` and `railway.json`, not the repo root).
3. Add the `ANTHROPIC_API_KEY` environment variable.
4. Deploy. Railway builds the Dockerfile and runs `node dist/server/entry.mjs`.

## Notes & limits

- Crawling is best-effort over plain HTTP (no headless browser). Fully client-rendered
  pages may yield little text — the tool degrades gracefully and flags those pages.
- Up to 25 URLs, 200 keywords, and 200 prompts are considered per run.

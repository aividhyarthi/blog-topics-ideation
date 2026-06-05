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

## AEO Auditor (`/audit`)

A second tool in the same app that **scores a finished article/page** for how
likely it is to be cited by LLM answer engines (ChatGPT, Perplexity, Gemini,
Google AI Overviews). Audit a **live URL** (it crawls the page) or **paste the
article HTML/plain text**.

It produces a 0–100 score + letter grade across **six evidence-weighted pillars**
and a ranked list of fixes:

| Pillar | Weight | Notes |
| ------ | ------ | ----- |
| Off-page Authority & Brand Prominence | 25% | Strongest correlate of LLM citation (Ahrefs: brand mentions ≈0.66 vs ≈0.22 backlinks). **Estimated** by Claude from training knowledge — not a live measurement. |
| On-page Trust & Evidence Density | 23% | Leads with the three causal GEO levers: cite sources, statistics, quotations (Princeton GEO, +30–40%). Plus author, freshness. |
| Answerability & Structure | 22% | Direct-answer-up-front, question headings, lists/tables, FAQ, TL;DR, conciseness (length is *not* rewarded). |
| Semantic Coverage & Intent | 15% | Answer completeness, topical depth, entity coverage, clear single intent. |
| Structured Data & Machine Readability | 8% | Schema, heading hierarchy, meta, alt text, crawlability. Weak evidence — `llms.txt` is intentionally **not** scored (debunked). |
| Readability & Hygiene | 7% | Reading ease, keyword-stuffing penalty, multimedia, internal links. |

Most signals are scored **deterministically** by parsing the HTML
(`src/lib/aeo.ts`); a few judgement/estimate calls go to Claude in
`src/pages/api/aeo-audit.ts`. Weights live in one `PILLARS` config so the rubric
is easy to tune. The tool predicts *page-level citability* — it does not measure
*actual* Share of Voice across prompts (what Semrush/Profound sell), and citation
behaviour varies a lot per engine, so treat the score as one composite signal.

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

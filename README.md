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

## ASO Inspector (`/aso`) — Google Play (Android) App Store Optimization

A tool in the same app that audits a **Google Play (Android) app listing** for
App Store Optimization. Paste a **Play Store URL** or a **package id**
(e.g. `com.whatsapp`) and it pulls the live listing via
[`google-play-scraper`](https://www.npmjs.com/package/google-play-scraper) and returns:

- **ASO score (0–100)** with a letter grade and an optimization band
  (Low/Medium/High). Like the AEO Auditor, the **score grades only
  owner-editable listing fields** — title, short/long description, keyword
  coverage, visual assets, freshness/metadata. Ratings, installs and app age
  are reported as **market signals** (outcomes), deliberately **not** in the score.
- **Six weighted pillars** (`src/lib/aso/audit.ts`): Title (20), Short
  description (15), Long description (20), Keyword strategy (20), Visual assets
  (15), Freshness &amp; metadata (10). Each pillar's signals are scored
  deterministically against Play's hard limits (title ≤30, short ≤80, long ≤4000).
- **Keyword analysis** — keywords extracted from the current listing (uni- and
  bi-grams) with a coverage matrix (in title / short / long), plus Claude-ranked
  **keyword opportunities** for the app's audience.
- **Competitor comparison** — paste competitor package ids/URLs (or let it
  **auto-discover similar apps**) and the same ASO scoring is applied to each
  rival listing, side by side.
- **AI-rewritten listing copy** — Claude proposes an optimized **title, short
  description and long-description opening**, each within Play's character
  limits, with one-click copy.
- **Ranked fixes** — the lowest-scoring editable signals, ordered by estimated
  point gain.

The engine is split like the others: `src/lib/aso/fetch.ts` (scraper wrapper +
normalization) → `src/lib/aso/audit.ts` (deterministic scoring, pure/testable) →
`src/pages/api/aso.ts` (endpoint: fetch + audit + Claude) → `src/pages/aso.astro`
(UI). The deterministic audit always works; the Claude layer (keyword strategy,
rewrites, verdict) is best-effort and degrades gracefully when
`ANTHROPIC_API_KEY` is unset. Live Play Store access is required at runtime, so
the host's outbound network must allow `play.google.com`.

## Rank Tracker (`/rank`) — Google Play keyword rank vs competitors

Given **your app + competitor apps + a list of keywords**, checks each
keyword against Play's live search results and reports where every app
actually shows up (position, or "not found"). Optionally also checks each
app's position in a category's Top Free chart (a separate, non-keyword
signal — Play doesn't expose "rank within category X for keyword Y" as one
lookup).

### Saved Trackers (the default view) — checks itself, no setup required

Save your app, competitors, and keyword list **once** and the tool checks
it **automatically every day** on its own (an in-process scheduler, no
external cron or config needed) and keeps a per-keyword rank history —
open the tracker any time to see the trend. A "Recheck now" button forces
an immediate check between automatic runs. History is stored as JSON files
under `RANK_DATA_DIR` (point it at a Railway Volume so it survives
redeploys, same pattern as `WBR_DATA_DIR`; defaults to `./.rank-data`,
lost on redeploy without a Volume).

Each tracker's keyword list comes from either:
- **Paste keywords** — a static list, one per line. No Google setup needed.
- **From Google Sheet** — point it at a Google Sheet once; the tracker
  **re-reads the `Focused Keyword` column fresh on every check** (including
  the automatic daily one), so new keywords added to the sheet are picked
  up on their own — no need to edit the tracker. It also writes that day's
  ranks back into the sheet as a `Rank (2026-07-04)` column per app, same
  as the one-off Sheet check. `Focused Keyword` is the permanent default
  column name (matches the existing ASO tracker sheets) — only change it if
  a sheet uses a different header. Requires the Google service account
  setup in `DEPLOY.md`.

### One-off Check — same two keyword sources, nothing saved

Runs once and shows the result without creating a Saved Tracker — useful
for a quick check. Same **Paste keywords** / **From Google Sheet** choice
as above.

Engine: `src/lib/rank/track.ts` (Play search + category chart, via
`google-play-scraper`), `src/lib/rank/store.ts` + `runner.ts` +
`scheduler.ts` (saved trackers, daily runs including live Sheet re-reads,
JSON history), and `src/lib/sheets/` (a minimal Google Sheets v4 REST
client + service-account auth — deliberately not the full `googleapis`
SDK) → `src/pages/api/trackers/`, `src/pages/api/rank.ts`,
`src/pages/api/rank-sheet.ts` → `src/pages/rank.astro`. Like the ASO
Inspector, this needs live outbound access to `play.google.com`; Sheet
mode also needs `sheets.googleapis.com` and `oauth2.googleapis.com`
reachable.

## WBR Builder (`/wbr`) — weekly AI-visibility report from SEMrush exports

Turns the weekly **SEMrush AI Visibility CSV bundle** into the full Beauty/Fashion
report (the same tables as the published May reports) — no manual Excel pivoting
or screenshot auditing.

### What you do

1. Download the weekly SEMrush exports per brand (Nykaa + competitors). The tool
   recognises four shapes by filename + header:
   - `brand_topics_<site>.csv` — the 1,000 topics (`name, visibility, mentions, volume, intents`)
   - `gap_topics_<site>.csv` — adds `gap_mentions` (`amazon.in:7;myntra.com:32;…`)
   - `sources_<site>.csv` / `citedpages-sources_<site>.csv` — cited pages (`url, prompts_count`)
2. Drop them all on `/wbr`, pick **Beauty** or **Fashion**, click **Generate**.
3. Review and **Download Excel** (every table in tabs) or **Print / Save PDF**
   (laid out like the client report).

### What it computes

- **Summary scorecard** — topics, avg visibility, mentions, search volume,
  topics ≥60 / ≥80, per brand (this vertical only; noise excluded).
- **Section A — Category scorecard** — topics/avg-vis/mentions/volume per
  category, plus the current category leader.
- **Section B — Topics to protect** — highest-volume topics with status.
- **Section C — Gap analysis** — topics where Nykaa = 0 but competitors rank,
  with per-competitor mentions and a High/Medium/Low priority.
- **Brand comparison** — mentions by category across brands.
- **Cited-source mix** — page-type breakdown (homepage / blog / PDP / junk …).
- **Review queue** — topics the rules couldn't confidently place (excluded from
  totals until reviewed).

### Week-over-week trends (history)

Each generated week is saved as a compact JSON snapshot in `WBR_DATA_DIR`, so the
next week is **automatically diffed** against the previous one — you only upload
the new week's CSVs. The report then shows a **"What changed this week"** section:
headline deltas, mentions movement by category, top visibility gainers/losers,
and new vs closed gaps. Manage saved weeks (and delete mistakes) from the
**View saved weeks** panel, or via `GET`/`DELETE /api/wbr-history`.

On Railway, mount a **Volume** and set `WBR_DATA_DIR` to its path (e.g. `/data`)
so history persists across redeploys. The history lives behind the same
`SITE_PASSWORD` gate as the rest of the site.

### Categorization (the manual "auditing", automated)

Topics are classified into a vertical (`beauty | fashion | noise`) and a category
by a **deterministic keyword dictionary** in `src/lib/wbr/categorize.ts`, so the
same topic lands in the same category every week (essential for trend tracking).
Topics it can't place are flagged for review, and — if `ANTHROPIC_API_KEY` is set
and the **Claude fallback** box is ticked — sent to Claude to classify the
leftovers. Tune the dictionary as new brands/topics appear.

The engine is pure and testable: `parse.ts` (CSV) → `categorize.ts` → `report.ts`
(tables) → `src/pages/api/wbr.ts` (endpoint) → `src/pages/wbr.astro` (UI + export).
Run it against a local folder of CSVs with
`npx tsx scripts/validate-wbr.ts <dir> <beauty|fashion>`.

## Tech

- [Astro](https://astro.build) (server output, Node adapter)
- [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) → Claude (`claude-sonnet-4-6`)
- Deployed on Railway via the included `Dockerfile` / `railway.json`

## Environment variables

| Variable             | Required | Notes                                  |
| -------------------- | -------- | -------------------------------------- |
| `SITE_PASSWORD`      | strongly recommended | Locks the WHOLE site behind HTTP Basic Auth. When unset, the site is open (local dev only). Set it in production — the WBR data is internal. |
| `SITE_USER`          | no       | Username for the password gate. Defaults to `nykaa`. |
| `ANTHROPIC_API_KEY`  | for AI features | Server-side Claude key. Needed for the AEO Auditor's AI signals and the WBR Claude fallback. Never exposed to the browser. |
| `WBR_DATA_DIR`       | for WoW trends | Folder where the WBR saves each week's snapshot so it can show week-over-week change. Point it at a **Railway Volume** mount (e.g. `/data`) so history survives redeploys. Defaults to `./.wbr-data` (lost on redeploy). |
| `RANK_DATA_DIR`      | for Saved Trackers' history | Folder where the Rank Tracker saves each saved tracker + its daily runs. Point it at a **Railway Volume** mount so trackers and rank history survive redeploys. Defaults to `./.rank-data` (lost on redeploy). |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | for Rank Tracker's Sheets mode | Full JSON key of a Google service account, used to read keywords from and write rank results into your Google Sheets. See `DEPLOY.md` for setup. Alternatively set `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Optional — Saved Trackers and paste-keywords mode both work fully without it. |
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

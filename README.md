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

## Rank Tracker (`/rank`) — App Radar-style keyword rank tracking

Tracks **where your apps rank in store search** for the keywords you care about,
on **Google Play** and the **Apple App Store**, with history so you can see
movement over time — the core of what App Radar / AppTweak / Sensor Tower sell.

- **Track apps** by Play URL / package id (`com.whatsapp`) or App Store URL /
  numeric id (`id310633997`), per **country** (add the same app twice to watch
  two markets). Track competitors' apps on the same keywords too. Up to 15
  apps × 60 keywords; adding/editing keywords re-checks the app immediately so
  new keywords show real ranks right away.
- **Keyword discovery** (`src/lib/rank/discover.ts`) — finds the keywords an
  app *already ranks for* in the top 200, no App Radar export needed. It builds
  a candidate universe from three free sources — the listing's own text
  (n-grams), **store autocomplete** (Play suggest API / Apple search hints:
  real queries users type), and **Claude keyword ideas** — then runs every
  candidate through store search and keeps the ones where the app appears.
  Results show rank + source; tick the ones to track. A full scan is ~90
  candidates ≈ 1–2 minutes.
- **Keyword rankings** — for each keyword, the app's 1-based position in store
  search (top 200 scanned), the **Δ vs the previous check**, the **best
  position ever recorded**, a **trend sparkline**, and **who holds #1** for
  that keyword right now.
- **Overview dashboard (App Radar-style)** — per app: **Top 1 / Top 10 /
  Top 30 / Top 100** headline counts with day-over-day movement, a **keyword
  rank distribution** stacked-bar chart by day (Top 1 → Top 101–200 →
  Unranked), and a **Search Visibility Score** (0–100) trend line — each
  keyword contributes on a log curve (#1 = 100, #10 ≈ 57, #100 ≈ 13,
  unranked = 0), averaged over tracked keywords. (Commercial tools also weight
  by keyword search volume, which needs paid data.)
- **Top-chart position** — the app's spot in Play's **Top Free chart for its
  category** (iOS: the storefront's overall Top Free, via Apple's public RSS).
- **History** — every check is saved as a per-day snapshot in `RANK_DATA_DIR`
  (mount a Railway Volume so it persists). Check on demand from the UI, or run
  `npx tsx scripts/rank-check.ts` on a **daily cron** (Railway cron schedule
  `0 6 * * *`) so trends accrue automatically.

  ⚠️ **Set the cron up as its own separate Railway service** (a second service
  in the same project, pointed at this same repo), and set its Start Command
  (`npx tsx scripts/rank-check.ts`) **only in that service's own dashboard
  Settings → Deploy**. Do **not** put it in the repo's `railway.json`
  `startCommand` — that file is shared by every service built from this repo,
  so editing it there overrides the *website's* start command too and takes
  the whole site down (`node dist/server/entry.mjs` is the correct value for
  `railway.json`; it must stay as the website's command).
- **Export CSV** of the current ranking table.

Data sources are keyless and free: `google-play-scraper` (already used by
`/aso`) for Play search/charts, Apple's **iTunes Search API** + marketing RSS
for iOS. Note that store search APIs approximate on-device results (live
rankings are personalized/experiment-bucketed) — positions are a consistent,
comparable-over-time signal, which is also true of commercial rank trackers.

The engine is split like the others: `src/lib/rank/fetch.ts` (all network) →
`src/lib/rank/track.ts` (pure position/trend math, tested by
`npx tsx scripts/validate-rank.ts`) → `src/lib/rank/check.ts` (check runner) →
`src/lib/rank/store.ts` (config + snapshots) → `src/pages/api/rank.ts` →
`src/pages/rank.astro` (UI). Live store access is required at runtime
(`play.google.com`, `itunes.apple.com`, `rss.marketingtools.apple.com`).

## AppRankr — the Rank Tracker as a paid product (`PRODUCT_MODE=1`)

The same repo can be deployed a second time as **AppRankr**, a paid multi-user
SaaS around the Rank Tracker. Set `PRODUCT_MODE=1` on that deployment and the
site becomes the product:

- `/` is a **landing page** with pricing; `/signup` + `/login` are
  email/password auth (scrypt-hashed, session cookies, built-in `node:sqlite`
  user DB — no external database service). The internal Nykaa tools 404 on
  this deployment and are untouched on the internal one.
- **Paid-only**: every signup starts a 7-day trial (`TRIAL_DAYS` to change);
  when it ends the dashboard locks until the user subscribes on `/account`.
- **Plans** (`src/lib/saas/plans.ts`): Starter ₹2,499/mo (3 apps × 30
  keywords), Pro ₹6,499/mo (10 apps × 60 keywords). Limits enforced
  server-side.
- **Razorpay billing** (India-first: UPI, cards, netbanking): `/account`
  creates a Razorpay Subscription and opens the Checkout modal; the success
  signature is verified server-side (`/api/billing/verify`) for instant
  activation, and webhooks (`/api/billing/webhook`) keep the status in sync
  (charged / halted / cancelled). Cancellation is first-party
  (`/api/billing/cancel`, end of billing cycle). Until the Razorpay env vars
  are set, checkout shows a friendly "payments not switched on yet".
- **Per-user data isolation**: each user's tracked apps + snapshots live in
  `RANK_DATA_DIR/users/<id>`; the user DB is `RANK_DATA_DIR/apprankr.db` —
  one mounted Volume persists everything.
- The daily cron (`scripts/rank-check.ts`) checks every user with a live
  trial/subscription, deduping identical keyword searches across users.
- Tests: `npx tsx scripts/validate-saas.ts` (auth, sessions, plan access,
  tenant isolation). Requires Node 22+ (`node:sqlite`) — the Dockerfile is
  on `node:22-alpine`.

### AppRankr environment variables

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `PRODUCT_MODE` | yes (product deploy only) | `1` switches this deployment to AppRankr. Leave unset on the internal deployment. |
| `RANK_DATA_DIR` | yes | Volume mount path — holds the user DB and all rank data. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for billing | API keys from the Razorpay dashboard (Settings → API Keys). |
| `RAZORPAY_PLAN_STARTER` / `RAZORPAY_PLAN_PRO` | for billing | Razorpay **plan ids** (`plan_…`): create two monthly plans (₹2,499 and ₹6,499) under Subscriptions → Plans. |
| `RAZORPAY_WEBHOOK_SECRET` | for billing | Secret you set on the webhook `POST {domain}/api/billing/webhook` (enable the `subscription.*` events). |
| `TRIAL_DAYS` | no | Defaults to 7. |
| `BRAND_NAME` | no | Defaults to `AppRankr`. |
| `ANTHROPIC_API_KEY` | recommended | Powers AI keyword ideas in discovery. |

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
| `RANK_DATA_DIR`      | for rank history | Folder where the Rank Tracker saves tracked apps + daily ranking snapshots. Point it at a **Railway Volume** mount (e.g. `/data/rank`) so history survives redeploys. Defaults to `./.rank-data` (lost on redeploy). |
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

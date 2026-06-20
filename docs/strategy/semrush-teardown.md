# SEMrush AI Visibility — Methodology Teardown & Our Differentiation

Source: direct answers from SEMrush support (Tarci, Customer Support) to our diligence questions, June 2026. This is the competitive backbone: **SEMrush's admitted weaknesses are our feature list — and we've already built about half of them.**

---

## A. How SEMrush actually works (confirmed)

| Dataset | Method | Refresh | Notes |
|---|---|---|---|
| **Prompt Database** (the topics / `brand_topics` / `gap_topics` you export) | **Clickstream + Google keyword datasets**, grouped into topics. **NOT live LLM API queries.** | Daily | 289M+ prompts. This is *observed/derived*, not freshly asked. |
| **Brand Performance** | Tracks brand appearance, sentiment, share of voice | Weekly | Across ChatGPT, Gemini, Perplexity, AI Mode |
| **Prompt Tracking** (campaign tool) | **Does** live-query selected engines for prompts you add | Daily | Citations here are *actual* source citations |
| **AI Search Site Audit** | Their crawler + AI-crawler checks | Per crawl | SSR/JS rendering check available here |

**Key realization:** the gap/topic data we build reports from is **clickstream-derived, not live-asked.** That's why it can disagree with what a user actually sees in ChatGPT today.

---

## B. The admitted weaknesses (verbatim-backed)

1. **No multi-run averaging / no confidence interval.** Repeatedly "checking with Product team" on: tested once or many times, margin of error, false-positive rate, statistical confidence. Best answer: *"We regularly run the same prompt… we don't test different versions."* → point-in-time, grouped into topics, **no stated confidence on a number.**
2. **Their data ≠ live reality.** They admit manual ChatGPT shows Nykaa where SEMrush says "not mentioned," blaming *"country settings or prior user history"* and a *"Last updated date."* → **stale + locale-blind.**
3. **No category normalization across brands.** *"The AI score doesn't break down market segments."* Nykaa (65% beauty prompts) vs Amazon (68% noise prompts) are scored from **different universes** — they confirm they don't normalize for relevance.
4. **Cited Pages includes junk.** *"Yes, we include every page from the domain that we cited"* — checkout/CDN/spam URLs included, **no quality weighting.** So baselines are inflated by garbage.
5. **Prompt set churns.** Only 5.7–12.9% overlap Jan→May for the same brand → **the measurement universe changes month to month, so trends are unstable** (they didn't give a real answer).
6. **Brand attribution is noisy.** Irrelevant prompts (MBA, IPO, electronics) get attributed via *"contextual association"* — brand mentioned in third-party content places it in the wrong context.
7. **Score formula is a black box.** Proprietary; = "Topic Coverage" + "Mention Consistency"; volume-weighting undisclosed.
8. **No API.** SEMrush API **does not expose** AI visibility / mentions / cited pages. Only **manual CSV export** or the panel. → we can't automate pulling their AI data.
9. **No statistical-significance guidance.** "No fixed threshold" for what change is meaningful — they punt to "look at sustained trends."

---

## C. Weakness → our differentiation → build status

| SEMrush weakness | Our answer | Already built? |
|---|---|---|
| Single point-in-time, no confidence (B1, B2, B9) | **Live querying + N-run averaging with confidence bands** | ⏳ DIY engine spec (Phase 1–2) |
| Stale, locale-blind (B2) | **Query live, with the client's locale/country fixed** | ⏳ DIY engine |
| No category normalization (B3) | **Noise-filtered, category-relevant scoring** — strip cross-vertical/corporate junk before scoring | ✅ `categorize.ts` (NOISE_RULES, cross-vertical handling) |
| Junk cited pages inflate counts (B4) | **Cited-page quality classification** (Junk/Transactional vs Blog/PDP) | ✅ `report.ts` `pageType()` — extend into scoring |
| Prompt-set churn breaks trends (B5) | **Frozen prompt set per client** (don't change the universe week to week) | ⏳ DIY engine (frozen prompt set principle) |
| Brand-attribution noise (B6) | **Deterministic taxonomy + alias entity matching** filters irrelevant topics | ✅ `categorize.ts` + `isBeautyBrand`/`hasKeyword` |
| Black-box score (B7) | **Transparent, published AEO score formula** (Presence + Citation + Prominence + Competitive rank) | ⏳ spec'd in DIY engine §5 |
| No API / manual CSV only (B8) | **Our own pipeline = our own API**; not dependent on their export | ⏳ DIY engine |

**Half the differentiation already exists in your codebase.** The taxonomy noise-filtering and cited-page quality classification are exactly the two things SEMrush admits it doesn't do — and you built them for the Nykaa WBR.

---

## D. The positioning this unlocks

You are not "a cheaper SEMrush." You are **"the rigorous, live, category-honest AEO measurement"** for one brand at a time:

- **Live, not clickstream-derived** — we ask the engines now, in your locale, so it matches what your customers actually see.
- **Averaged, not single-shot** — we run each prompt N times and report a confidence range, not a noisy one-off.
- **Category-honest** — we strip the corporate/cross-category noise SEMrush leaves in, so your score and your competitor's are the same universe.
- **Quality-weighted citations** — we separate real content citations from junk/checkout/CDN pages SEMrush counts as wins.
- **Stable trends** — a frozen prompt set, so week-over-week movement is real signal, not panel churn.

> Every one of these bullets is a direct answer to a weakness SEMrush's own support team confirmed. That's the sales narrative *and* the build spec.

---

## E. What this changes about our plan

1. **The DIY engine moves up in priority.** SEMrush's no-API + clickstream-derived + churning-prompt-set means depending on their export caps how good your product can be. Building the live engine isn't just de-risking — it's how you become *better*, not just cheaper.
2. **Lead with the two things already built.** In the Snapshot/pilot, explicitly show: (a) noise-filtered category scoring, (b) cited-page quality split. These are instant, free differentiators on top of SEMrush data *today*.
3. **The AEO Score must be transparent** — publish the formula. SEMrush's black box is a trust gap you exploit.
4. **Frozen prompt set is non-negotiable** — it's the fix to their worst flaw (B5 churn) and the foundation of believable trends.

---

*Companion to `diy-visibility-engine.md` (the build) and `outreach-kit.md` / `pilot-deliverable.md` (the GTM). This doc is the "why we win" layer.*

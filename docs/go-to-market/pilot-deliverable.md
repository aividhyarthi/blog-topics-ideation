# CiteRank — Pilot Deliverable Template (the weekly report a client gets)

**What this is:** the exact structure, client-facing language, and 4-week arc of the report a pilot client receives every week. Use it to scope the pilot on the call, and as the production template each week.

**Pilot shape (from the GTM kit §8):** 4 weekly reports · 1 brand · defined competitor set · flat pilot fee credited toward month 1.

> **Production note (read first):** every data section below maps to an output your tools already compute. The **gap analysis** is generated today by `/snapshot` for *any* brand. The **full weekly scorecards/stories** are produced by `/wbr`, which is currently Nykaa-hardcoded — so for a non-Nykaa pilot you either (a) produce those tables semi-manually from the SEMrush export, or (b) generalize the WBR engine for a configurable primary brand (the recommended follow-on build). This template is valid either way.

---

## 1. What the client receives each week

A single, branded PDF (their logo, their accent colour) + the underlying Excel. Delivered by email every [day], same time. No dashboard login. Sections, in order:

| # | Section | Purpose | Source |
|---|---|---|---|
| 0 | Cover + week header | Branding, week, one-line verdict | manual / template |
| 1 | Executive summary | The story in plain English for a CMO | `/wbr` stories (generalized) |
| 2 | This week's scorecard | Headline KPIs + week-over-week | `/wbr` summary + trends |
| 3 | Category scorecard | Performance by product category | `/wbr` categoryScorecard |
| 4 | Topics to protect | Highest-volume topics + status | `/wbr` protect |
| 5 | Gap analysis | Where you're invisible & who's cited | `/snapshot` + `/wbr` gaps |
| 6 | Brand vs competitors | Head-to-head by category | `/wbr` brandComparison |
| 7 | Cited-source mix | What page types AI cites | `/wbr` sourceAnalysis |
| 8 | **The roadmap** | Prioritised actions for next week | **the value-add — see §3** |
| 9 | Methodology + glossary | Trust / defensibility | `/wbr` GLOSSARY |

---

## 2. Section templates (client-facing copy)

Merge fields: `{{Brand}}`, `{{Week}}`, `{{Competitor}}`, `{{Category}}`, `{{N}}`, `{{Volume}}`.

### 0 · Cover
> **{{Brand}} — Weekly AI-Visibility Report**
> Week of {{Week}} · Prepared by Rudra Kasturi Inc · CiteRank
> **This week:** {{one-line verdict — e.g. "Held 6 of 8 categories; closed 2 gaps in Skincare; Foxtale gaining in Serums."}}

### 1 · Executive summary
Two short paragraphs, no jargon:
> **Your story.** {{Brand}} appears for {{N}} {{Category}} topics in AI answers ({{N}} mentions, avg visibility {{N}}). You lead {{N}} of {{N}} categories. Strongest: {{…}}.
>
> **The competitive picture.** {{Competitor}} is the brand to watch — {{why}}. The single biggest opportunity is {{the top gap}}.

### 2 · This week's scorecard (with WoW)
| Metric | This week | Last week | Δ |
|---|---:|---:|---:|
| Topics in AI answers | | | |
| Total AI mentions | | | |
| Avg AI visibility | | | |
| Topics owned (≥ threshold) | | | |
| Open gaps | | | |
| Gap volume at stake | | | |

*Call-out: one sentence on the most important movement this week.*

### 3 · Category scorecard
| Category | Topics | Avg visibility | Avg mentions | Search volume | Leader | Signal |
*Call-out: which categories you lead, which to defend.*

### 4 · Topics to protect
| Category | Topic | Visibility | Mentions | Volume | Status |
*Call-out: under-protected high-volume topics to prioritise.*

### 5 · Gap analysis (the wedge, now tracked weekly)
| Topic | Category | Monthly searches | Competitor cited | Their mentions | Status (new / closing / closed) |
*Call-out: total addressable gap volume, and which gaps moved this week.*

> This is the section that proves the engagement is working: gaps move from **open → closing → closed** week over week. Track that transition explicitly — it's your renewal argument.

### 6 · Brand vs competitors
| Category | {{Brand}} | {{Competitor 1}} | {{Competitor 2}} | … |
*Bold = category leader. Call-out: where you overtook / lost a competitor this week.*

### 7 · Cited-source mix
| Page type | {{Brand}} | {{Competitor 1}} | … |
*Call-out: e.g. "Homepage = X% of your citations — grow blog/PDP citations to compound mentions."*

### 8 · The roadmap (THIS is what they pay for)
Not in the raw WBR — this is your analyst layer. 3–5 prioritised actions, each:

| Priority | Action | Why (data) | Owner | Target |
|---|---|---|---|---|
| High | Publish/optimise content for "{{TopGapTopic}}" | {{Volume}} searches; {{Competitor}} cited, you're absent | Content | Next 2 wks |
| High | Strengthen PDP for {{Category}} | Cited-source mix too homepage-heavy | Web | Next 2 wks |
| Med | … | | | |

*Each week, restate last week's actions and whether they moved the needle. That accountability loop is the product.*

### 9 · Methodology + glossary
Reuse the plain-English glossary the engine already ships (`GLOSSARY` in `src/lib/wbr/report.ts`) + one line: *"Data from SEMrush AI Visibility across ChatGPT, Gemini, Perplexity and Google AI Overviews. Categorization is deterministic, so week-over-week trends are real."*

---

## 3. The 4-week pilot arc

The pilot must visibly compound, not feel like the same report 4 times.

| Week | Emphasis | What lands |
|---|---|---|
| **1 — Baseline** | Full picture + biggest gaps + **Roadmap v1** | "Here's where you stand and the 5 things to do." |
| **2 — First movement** | Did week-1 actions register? New gaps surfaced | "We acted; here's the earliest signal + what's next." |
| **3 — Progress** | Gaps open→closing, deeper competitor watch | "X gaps are closing; {{Competitor}} is moving on Y — defend." |
| **4 — Results + renewal** | Recap of the 4-week delta + **renewal proposal** | "In 4 weeks: +N mentions, M gaps closed, here's the ongoing plan." |

### Week-4 renewal close (put it in the report + the email)
> Over this pilot, {{Brand}} moved from {{baseline}} to {{now}}: **+{{N}} AI mentions, {{M}} gaps closed, {{K}} categories defended.** The gaps still open represent ~{{Volume}} monthly searches. The weekly engagement keeps this compounding — tracking every gap to closed, defending categories before competitors take them, and giving your team a fresh roadmap each week.
>
> Continue at **[Starter/Growth tier]** — your pilot fee is credited to month 1.

---

## 4. Delivery email (weekly)

**Subject:** {{Brand}} AI-Visibility Report · Week of {{Week}}

> Hi {{FirstName}},
>
> This week's report is attached. Headline: {{one-line verdict}}.
>
> Top 3 things worth your team's attention:
> 1. {{…}}
> 2. {{…}}
> 3. {{…}}
>
> Roadmap for next week is on the last page. Happy to walk through it — 15 min?
>
> {{YourName}} · CiteRank

---

## 5. Production checklist (each week, per client)

1. Pull this week's SEMrush AI-Visibility exports for the client's domain + competitor set (`brand_topics`, `gap_topics`, `sources`).
2. Generate the gap view in `/snapshot` (works for any brand today).
3. Generate the full report in `/wbr` (Nykaa today; generalize for other brands — see §6).
4. Drop the client's logo + accent colour; export PDF + Excel.
5. Write the **roadmap** (§2.8) and the **one-line verdict** — the human layer.
6. Update the gap **open→closing→closed** tracking vs last week.
7. Send the delivery email (§4).

Target: **under 60–90 min per client per week** once the engine is generalized.

---

## 6. Follow-on build to make this fully automatic

To produce sections 1–7 for **any** pilot brand (not just Nykaa), generalize the WBR engine the same way the Snapshot was generalized:

- Make `PRIMARY` a configurable primary brand (it's hardcoded to `'nykaa'` in `src/lib/wbr/report.ts`).
- Replace literal "Nykaa" strings in `computeStories` / `computeHighlights` / `computeTableNotes` with the primary brand's display name.
- Generalize `shortHost` (currently hardcoded to the Indian marketplaces) to any competitor host.
- Add a client-facing wrapper page (cover, branding, roadmap input) like `/snapshot` has.

Until then, the template above is fully usable with semi-manual production for the first pilot.

---

*Prepared as part of the CiteRank productization plan. Pairs with `outreach-kit.md` (how you land the pilot) — this is what you deliver once you have.*

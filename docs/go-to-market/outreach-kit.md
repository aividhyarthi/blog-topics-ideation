# CiteRank — Go-To-Market Outreach Kit (v1)

**Wedge:** the AI Visibility Snapshot (`/snapshot`).
**Vertical:** Indian D2C beauty / personal-care.
**Motion:** founder-led, Snapshot-first direct outbound.
**Goal:** land the first 3–5 paying weekly-reporting clients.

The whole motion is one move: **run a free Snapshot on a prospect, send it, and let the gaps sell the call.** You are not selling a tool in the cold email — you are handing them proof they're losing AI search to a named competitor. The Snapshot does the talking.

---

## 1. ICP (who to target first)

| Filter | Target |
|---|---|
| Vertical | Beauty / skincare / personal-care D2C (your taxonomy already covers it) |
| Stage | Funded / scaling D2C, ~₹50Cr–₹1,000Cr revenue, or well-funded newer brands |
| Org signal | Has an in-house **Head of Growth / SEO / Performance Marketing / Digital** (someone who owns organic and will feel AI-search anxiety) |
| Pain signal | Already invests in SEO/content; a competitor outranks them in ChatGPT/AI Overviews for category terms |
| Anti-signal | Pure marketplace sellers, no website content, no growth owner, pre-revenue |

**Buyer:** Head of Growth / Performance / SEO.
**Their fear (your hook):** "We're invisible in AI answers and [competitor] isn't — and nobody internally is even measuring it."

---

## 2. Target list structure

Keep a simple sheet (Google Sheet is fine — stateless, no CRM needed yet). One row per prospect:

| Column | Notes |
|---|---|
| Brand | Prospect name |
| Domain | For the SEMrush pull |
| Category focus | Skincare / makeup / haircare / fragrance — sets the Snapshot vertical + narrative |
| Named competitor | The one rival to feature in the Snapshot verdict (pick the sharpest) |
| Contact name / title | The growth owner |
| LinkedIn URL | |
| Email | |
| Snapshot status | Not run / Run / Sent |
| Touch 1 / 2 / 3 date | |
| Reply / Call booked | |
| Notes | |

### Starter target set (Indian D2C beauty — pick ~20 to start)

These map cleanly onto the competitor brand list your engine already knows, so the Snapshots will be rich:

- **Skincare-led:** Minimalist, The Derma Co, Dot & Key, Foxtale, Deconstruct, Pilgrim, Earth Rhythm, Aqualogica, Re'equil, Dr. Sheth's
- **Makeup-led:** SUGAR Cosmetics, Kay Beauty, Swiss Beauty, MARS Cosmetics, Renee, Insight Cosmetics, Typsy Beauty, Gush Beauty
- **Personal-care / mass:** Mamaearth, Plum, mCaffeine, WOW Skin Science, Bella Vita Organic, Sirona, Pee Safe
- **Men's grooming:** Beardo, Bombay Shaving Company, The Man Company, Ustraa

> Pick brands where you can name a **specific, credible competitor** for the verdict line — that contrast is what makes the Snapshot land. (e.g. Minimalist vs The Derma Co; SUGAR vs Nykaa/Lakmé; Foxtale vs Dot & Key.)

---

## 3. The Snapshot drop play (the core motion)

For each prospect, 15–20 min of work:

1. **Pull** the prospect's `gap_topics` (and `brand_topics` if you have it) from SEMrush AI Visibility for their domain.
2. **Generate** the Snapshot at `/snapshot` — set vertical, prospect name, accent colour, drop their logo.
3. **Print to PDF.** Name it `AI-Visibility-Snapshot-{{Brand}}.pdf`.
4. **Pull the 3 numbers** you'll lead the email with: gap count, total gap volume, the top competitor.
5. **Send** the email below with the PDF attached (or a screenshot of the verdict + gap reel in the body — screenshots get opened more than attachments).
6. **Log** status in the sheet.

> The first call is *not* a demo. It's you walking them through their own Snapshot. The deck is their data.

---

## 4. Cold email sequence (3 touches)

Merge fields map 1:1 to Snapshot output: `{{Brand}}`, `{{Competitor}}`, `{{GapCount}}`, `{{GapVolume}}`, `{{Category}}`, `{{TopGapTopic}}`.

### Touch 1 — the proof (Day 0)

**Subject:** {{Brand}} is invisible in AI search for {{GapCount}} buying-intent terms

> Hi {{FirstName}},
>
> I ran an AI-search visibility check on {{Brand}} this week. When people ask ChatGPT, Gemini and Google's AI Overviews about {{Category}}, {{Brand}} doesn't show up for **{{GapCount}} high-intent topics worth ~{{GapVolume}} monthly searches** — and **{{Competitor}} is being cited instead**.
>
> One example: for "{{TopGapTopic}}", {{Competitor}} is recommended and {{Brand}} isn't mentioned at all.
>
> I put the full breakdown — every gap, by category, with who's winning — on one page. Attached, no strings.
>
> Worth a 20-min call to walk through it and where the quickest wins are?
>
> {{YourName}}
> Rudra Kasturi Inc · CiteRank

*Attach the Snapshot PDF, or paste the verdict line + gap-reel screenshot inline.*

### Touch 2 — the "why now" (Day 3–4, reply to T1)

> Quick follow-up — the reason this matters now: AI answers are becoming the first place people get product recommendations, and unlike Google there's no second page. You're either the cited brand or you're invisible.
>
> The {{GapVolume}} searches in that Snapshot are demand {{Competitor}} is converting in AI answers today. Happy to show you which 3 are the fastest to win back. 15 minutes?

### Touch 3 — the breakup (Day 8–10)

> Last one from me, {{FirstName}} — I'll assume AI search isn't a priority this quarter and stop here.
>
> If it becomes one: I run a weekly AI-visibility report for a top beauty retailer, and I'm offering the same to a few D2C brands. The Snapshot I sent is a one-time pull; the weekly version tracks every gap as you close it. Door's open.

---

## 5. LinkedIn variant (for no-email contacts)

**Connection note (300 char):**
> Hi {{FirstName}} — I analysed {{Brand}}'s visibility in AI search (ChatGPT/Gemini/AI Overviews) and found {{GapCount}} {{Category}} topics where {{Competitor}} is cited and {{Brand}} isn't. Happy to send the one-pager — would it be useful?

**After they accept:**
> Thanks for connecting! Here's the Snapshot — every AI-search gap for {{Brand}} on one page, with who's winning each. [link/PDF] No ask; just thought the {{Competitor}} comparison would land with your team. If it's useful I can show you the 3 quickest wins.

---

## 6. First-call script (20 min)

1. **(2 min) Frame.** "This is your data, not a pitch. Let's look at where {{Brand}} is losing AI search and what's worth doing about it."
2. **(8 min) Walk the Snapshot.** Verdict → gap reel → category exposure → competitor leaderboard. Let the {{Competitor}} contrast sit.
3. **(5 min) Discovery:**
   - Who owns organic / content today? Are you measuring AI-search visibility at all?
   - When a customer asks ChatGPT about {{Category}}, do you know if you show up?
   - What would it be worth to win back the top 5 of these gaps?
4. **(3 min) The offer.** "This Snapshot is one pull. What I do is the weekly version — track every gap as you close it, give your team a prioritised roadmap, and a client-ready report each week. No dashboard to learn."
5. **(2 min) Close to next step.** Propose a 4-week paid pilot (see §8).

---

## 7. Objection handling

| Objection | Response |
|---|---|
| "We already use SEMrush / Ahrefs." | "Those give you a dashboard to interpret. I give you the analyzed weekly answer by product category, plus the roadmap — the work your team doesn't have time to do. The Snapshot was built on SEMrush data; the value is the analysis layer." |
| "Is AI search really driving sales yet?" | "It's where the next discovery happens, and there's no page 2 — you're cited or invisible. The brands measuring it now will own the categories before it's obvious. {{Competitor}} already has a head start on {{GapCount}} of your terms." |
| "How accurate is this?" | "Every number is from the SEMrush AI-visibility dataset and you can see the methodology. The categorization is deterministic — the same topic lands the same way every week, so trends are real, not noise." |
| "Can we just do this in-house?" | "You can — it's a weekly day of Excel auditing per brand. I've automated exactly that. Most growth teams would rather have the report than build the pipeline." |
| "Too expensive." | "It replaces a dashboard subscription *plus* an analyst's day a week. Start with the pilot — if the roadmap doesn't pay for itself, walk." |

---

## 8. The offer / pricing frame (tie to call)

- **Paid pilot (the close):** 4 weekly reports, one brand, defined competitor set — **₹40–60k flat**, credited toward the first month if they continue.
- **Then:** Starter ~₹40–65k/mo (1 brand, weekly report) → Growth ~₹1–1.6L/mo (multi-category, larger competitor set, monthly strategy readout).
- **Setup fee** (₹40k–1.2L) for onboarding + taxonomy tuning; qualifies serious buyers.
- Anchor: *"replaces a tool subscription **and** an analyst's time."*

*(Rupee bands are placeholders — set to your cost/positioning. The $ bands from the strategy doc map roughly at ~₹83/$.)*

---

## 9. Weekly cadence for a solo operator

- **Mon:** generate 10–15 new Snapshots, send Touch 1.
- **Tue/Thu:** send Touch 2 / Touch 3 to prior batches; take calls.
- **Fri:** deliver live clients' weekly reports (the paid work).
- **Target funnel:** ~50 Snapshots → ~10 calls → ~2–3 pilots → 1 client. So ~150–250 Snapshots gets you to the first 3–5 logos.

---

*Prepared as part of the CiteRank productization plan. The Snapshot tool that powers touch 1 lives at `/snapshot`.*

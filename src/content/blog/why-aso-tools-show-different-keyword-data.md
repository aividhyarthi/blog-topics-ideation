---
title: "Why Do ASO Tools Show Different Keyword Data? (And How to Pick One to Trust)"
description: "AppTweak says one thing. Sensor Tower says another. Appfigures disagrees with both. Here's the real reason ASO tools never match on keyword volume, and how to actually use the numbers anyway."
theme: "Keywords"
image: "/blog/og/why-aso-tools-show-different-keyword-data.png"
publishDate: 2026-09-04
faqs:
  - question: "Why do different ASO tools show different search volume for the same keyword?"
    answer: "Neither Apple nor Google publishes real keyword search volume. Every ASO tool is estimating it from a different proxy signal instead: search suggestion position, install correlation, ad auction data, or a mix. Different proxies produce different numbers. None of them are wrong exactly. They're measuring different things and calling it the same name."
  - question: "Is there a keyword tool that's actually accurate?"
    answer: "None of them can be, in the strict sense, because there's no public ground truth to check any of them against. What you can do is pick one tool and stay consistent with it, so a tracked keyword's number this month is comparable to last month's, even if it doesn't match a different tool's number for the same term."
  - question: "Does this same problem happen in regular web SEO?"
    answer: "Yes, and it's well documented there. Google Ads, Semrush, and Ahrefs routinely report different volumes for the same search term, sometimes off by 2-3x. Independent testing has found tools like Ahrefs match real Google Search Console data only around 60% of the time. ASO tools face the identical problem, just with even less public data to estimate from."
---

**Key points:**
- Apple and Google both keep real keyword search volume private. Every ASO tool is estimating it, not reporting it. Each one estimates from a different signal.
- Apple's closest public proxy is [Search Popularity inside Apple Search Ads](https://www.mobileaction.co/blog/app-store-optimization/apple-search-popularity-decoded/). It's a relative 1-100 index on an exponential scale. It's not a real search count.
- Google Play has no native keyword volume metric at all. Third-party tools estimating Play keyword demand have even less to work with than on iOS.
- The same mismatch happens in web SEO too. Google Ads, Semrush, and Ahrefs routinely disagree on volume for the same term, sometimes by 2-3x. This isn't an ASO-specific flaw. It's a data-availability problem. It shows up everywhere volume gets estimated instead of measured.

You check the same keyword in two different ASO tools. One says it's a strong opportunity. The other says it's barely searched at all. Neither tool is broken. You've just run into the real reason this keeps happening. Worth understanding once instead of re-arguing it every time a client asks.

## Neither platform publishes the real number

Apple doesn't release keyword search volume. Google doesn't either. That's not a documentation gap you can dig around. It's a deliberate choice by both companies. It means every ASO tool you've ever used is building an estimate from whatever data it CAN see. Not reading off a real count.

Apple gives developers one indirect signal. [Search Popularity](https://trysonar.app/blog/apple-search-popularity), a score inside Apple Search Ads. It's a relative index from roughly 1 to 100. Built as a rolling average of search impressions. The scale is exponential too. A jump from 50 to 60 means a much bigger real difference than a jump from 20 to 30. Most tools showing a "volume score" for iOS keywords work from this same signal. Not a real count.

Google Play doesn't expose anything like this at all. There's no official popularity signal to estimate from on the Android side.

## Different tools, different proxies

Given the same starting problem, ASO tools reach for different substitute signals. Some use store search-suggestion position. That's how fast a keyword auto-completes. And where your term sits in that list. Some blend in install correlation too. Some, like [AppFollow](https://support.appfollow.io/hc/en-us/articles/360020832897-Keyword-Popularity-Score), say they combine more than 25 separate factors into one score. On iOS specifically, some tools just mirror Apple's own Search Popularity number back to you. Nothing computed independently.

None of these approaches is dishonest. They're all reasonable ways to guess at something neither platform will tell you. That's exactly why the same keyword gets a different score in every tool you check.

| What the tool measures | What it's really estimating |
|---|---|
| Search suggestion position | How fast/prominently a term auto-completes |
| Install correlation | Whether installs cluster around ranking for that term |
| Apple's own Search Popularity | Apple's relative 1-100 index, passed through |
| A blended multi-factor score | A weighted mix of the above, tuned per vendor |

## This isn't unique to ASO

If this feels uniquely frustrating about app tools, it helps to know the identical problem is well documented in plain web SEO. There's actually MORE public data there to work with. Google Ads, Semrush, and Ahrefs have all been caught reporting wildly different monthly search volumes for the exact same term. One comparison found a single keyword valued at 880,000 by Google Ads, 590,000 by Semrush, and just 100,000 by Ahrefs. That's not a rounding difference. [Ahrefs' own accuracy testing](https://help.ahrefs.com/ahrefs-terminology/keywords-explorer/how-accurate-is-the-keyword-search-volume-in-ahrefs) found its own numbers matched real Google Search Console data only about 60% of the time. Google's own free Keyword Planner matched only about 45% of the time.

That's web SEO. Far more crawlable public data than any app store gives up. If the tools can't agree there, disagreement in ASO tools isn't a red flag about any one vendor. It's the same limitation. Just tighter.

> **Real-world scenario:** A team building a keyword list for a new fintech app pulled the same 40 candidate keywords through two different ASO tools before deciding what to prioritize. Roughly a third of the keywords got a different "high vs low opportunity" verdict between the two tools. Instead of picking a winner, the team cross-checked those disputed keywords against their own actual search-result data. Whichever term consistently surfaced the same 3-5 competitor apps at the top, in both tools, got treated as real demand worth targeting. Terms where the top results looked random or inconsistent got deprioritized, no matter which tool scored them higher. The volume number stopped being the decision. What actually showed up in real search results became the real signal.

## What to actually do about it

1. **Pick one tool and stay consistent with it.** The number itself matters less than the trend. A keyword's score climbing or falling over time, inside one tool, tells you something real. Comparing across tools rarely does.
2. **Treat "volume" as a rough tier, not a precise figure.** High, medium, or low is usually about as much confidence as any of these scores deserve.
3. **Check what actually ranks for a keyword before trusting a volume score alone.** If the same handful of real competitor apps consistently hold the top spots for a term, real demand exists whatever the score says.

[AppRankr's Rank Tracker](/rank) checks your actual position for every keyword you track, every day. Whether you're ranking, and whether that's moving, doesn't need to depend on any single vendor's volume estimate at all.

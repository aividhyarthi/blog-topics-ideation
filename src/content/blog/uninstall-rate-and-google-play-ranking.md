---
title: "Uninstall Rate and Google Play Ranking: What's Confirmed vs Assumed"
description: "Google has never named uninstall rate as a ranking factor the way it has crash rate. Here's what's actually documented, what's inferred, and what to do about it either way."
theme: "App Quality & Vitals"
image: "/blog/og/uninstall-rate-and-google-play-ranking.png"
publishDate: 2026-08-18
faqs:
  - question: "Is uninstall rate an official Android vitals ranking factor?"
    answer: "No. Android vitals publishes explicit bad-behavior thresholds for crash rate, ANR rate, and a handful of other technical metrics. Uninstall rate isn't one of them. What Google has stated is that retention and engagement quality feed into ranking, and a high uninstall rate is the clearest external symptom of an app failing on both, but that's an inference from adjacent statements, not a confirmed direct factor."
  - question: "If uninstall rate isn't confirmed, why does it seem to correlate with rank drops?"
    answer: "Because the same underlying problems that spike uninstalls, a bad first-run experience, a misleading listing that sets the wrong expectation, a bug in a recent release, are the exact things that also hurt the confirmed factors: crash rate, retention, and rating velocity. Uninstalls often move alongside a rank drop because they share a cause, not because uninstalls independently trigger one."
  - question: "How can I even measure my app's uninstall rate?"
    answer: "Play Console's Statistics page reports uninstalls over time, and can be segmented by acquisition source, version, and country. Compare it against your install trend over the same window rather than looking at either number alone, a rising uninstall count during a period of high install growth can be completely normal."
---

Search "does uninstall rate affect Google Play ranking" and you'll find confident answers on both sides, some treating it as an established ranking factor, others dismissing it entirely. Neither is quite right. The honest answer requires separating what Google has actually stated from what the ASO community has reasonably inferred, and treating those as different levels of confidence.

## What's actually confirmed

Google's own Android vitals documentation names specific bad-behavior thresholds tied to visibility: crash rate, ANR rate, and a set of technical performance metrics. Uninstall rate does not appear on that list. If you're looking for a Google statement that says "uninstalls above X% will reduce your ranking," it doesn't exist, at least not published anywhere the way the vitals thresholds are.

## What's reasonably inferred, and why

Google has separately stated that engagement and retention quality inform ranking. A high uninstall rate, especially soon after install, is a strong external signal that engagement is failing, even without Google saying "uninstalls specifically" out loud. The inference isn't a stretch, it's closer to: uninstalls are a symptom that correlates tightly with confirmed factors, not a separate lever pulling on rank by itself.

| | Status | What to do with it |
|---|---|---|
| Crash rate, ANR rate | Confirmed, documented threshold | Check Play Console → Quality → Android vitals directly |
| Retention, engagement | Confirmed to inform ranking, no published formula | Track cohort retention, not just the average |
| Uninstall rate | Not a named factor, correlates with the above | Treat as a symptom worth investigating, not a lever to pull directly |

## Why the distinction actually matters

If you treat uninstall rate as a confirmed independent ranking factor, you'll chase the wrong fix, trying to suppress the number itself (nudging users not to uninstall, adding exit surveys) instead of the underlying cause. If you treat it as a symptom, you go looking for what's actually driving it: a specific version with a bug, a listing that oversells what the app does, an onboarding flow that loses people in the first session. Fixing the cause moves both the uninstall number and the confirmed factors it's correlated with. Fixing the symptom moves neither.

> **Real-world scenario:** A shopping app noticed uninstall rate had climbed from 22% to 31% of installs over three weeks, right alongside a keyword rank drop. The team's first instinct was to add a "why are you leaving?" survey, treating the uninstall number itself as the problem. Checking Android vitals instead showed ANR rate had crossed the bad-behavior threshold the same week, traced to a slow database migration on first launch after an update. Fixing the migration brought ANR rate back under threshold, and uninstall rate and rank both recovered within the next two weeks, without the survey ever shipping.

## What to actually check, in order

1. **Confirm Android vitals first.** Crash rate and ANR rate are the documented, fast-to-check factors. See [crash rate](/blog/crash-rate-and-google-play-ranking) and [ANR rate](/blog/anr-rate-and-google-play-ranking) for the specifics on each threshold.
2. **Segment uninstall rate by version and acquisition source**, not just the aggregate. A spike tied to one release version points straight at what shipped; a spike tied to one acquisition channel points at mismatched expectations from that channel's creative, not the app itself.
3. **Look at day-1 vs day-7 vs day-30 uninstall timing.** A day-1 spike usually means onboarding or a misleading listing; a slower climb over weeks usually means the app itself stopped delivering value it once did.
4. **Correlate the timeline against your rank trend**, the same way you would for [any other rank drop](/blog/why-did-my-app-ranking-drop). [Annotating releases against your rank history](/rank) turns "did that update cause this" into a lookup instead of a guess.

Uninstall rate is worth watching closely, just not as a lever with its own dial. It's the fastest-moving symptom of the same underlying quality problems the stores have actually confirmed they weigh, and treating it that way points you at fixes that move the numbers that matter.

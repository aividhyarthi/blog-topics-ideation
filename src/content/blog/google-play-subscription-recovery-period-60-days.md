---
title: "Google Play's 60-Day Recovery Window: A Real Lever Against Subscription Churn"
description: "Google extended its default subscription payment recovery period from 30 to 60 days. Here's how grace period and account hold actually split that window, and why your own settings still matter."
theme: "Conversion & Growth"
keyword: "60-day subscription recovery window"
image: "/blog/og/google-play-subscription-recovery-period-60-days.png"
publishDate: 2026-09-17
faqs:
  - question: "What changed in Google Play's subscription recovery period?"
    answer: "Google extended the default recovery window for failed subscription payments from 30 to 60 days. Effective December 1, 2025. That gives a subscriber more time to fix a problem, like an expired card, before they're lost for good."
  - question: "What's the difference between grace period and account hold?"
    answer: "Grace period keeps a user subscribed with full access while Google retries the failed payment. Account hold suspends access if that retry fails, but keeps trying. Both sit inside the same 60-day window. Account hold length equals 60 minus your grace period."
  - question: "Does this happen automatically, or do I need to configure something?"
    answer: "The 60-day window is Google's new default. Reports say developers who set both grace period and account hold on purpose see real gains in recovery rate. So check your own setting directly. Don't just assume the new default alone covers it."
---

**Key points:**
- Google's own recovery policy extended the default window from 30 to 60 days. Effective December 1, 2025.
- That window splits into two phases: grace period (still subscribed, full access) and account hold (access suspended, retries keep going).
- Account hold length equals 60 minus your grace period. The two settings are linked, not separate.
- [RevenueCat's reporting](https://www.revenuecat.com/blog/growth/google-play-billing-error-churn-how-to-fix) describes up to an 18% cut in involuntary churn for top developers. And a jump from roughly 10% to 33% recovery when both settings are set on purpose. Treat these as reported numbers, not verified here.

A failed card charge doesn't have to mean a lost subscriber. Google gave that recovery process twice the room to work. But the real gain depends on how you set two specific numbers. Not just on the new default existing.

## What Google's own policy confirms

The default recovery period moved from 30 days to 60 days. Effective December 1, 2025. That window isn't one flat grace period. It's two phases stacked together:

| Phase | What happens | Access |
|---|---|---|
| Grace period | Google retries the failed payment | Full access continues |
| Account hold | Retries continue after grace period fails | Access suspended |

One formula links the two. Account hold length equals 60 days minus your grace period. Set a longer grace period, and account hold shrinks to match. Set a short one, and account hold picks up the rest. Either way, the total stays capped at 60.

## Why your own configuration still matters

A longer default window helps everyone a little. But [reporting from RevenueCat](https://www.revenuecat.com/blog/growth/google-play-billing-error-churn-how-to-fix) describes a much bigger gap for developers who set both values on purpose. Recovery rates reportedly jump from around 10% to roughly 33% on payment declines. Close to a 3x difference. The same report describes up to an 18% cut in involuntary churn, and a 9% drop in total churn, for top developers. These are reported numbers from outside analysis. Not verified here. But they point at a real, checkable lever: your own grace period and account hold settings. Not just the fact that a 60-day window now exists.

> **Real-world scenario:** A subscription app had never touched its Google Play recovery settings. The team assumed Google's own default handled failed payments well enough alone. They read through grace period versus account hold directly. They found their grace period set far shorter than it needed to be. That pushed most of the window into account hold, where users had already lost access and rarely noticed or acted. They lengthened the grace period. More of the 60 days now kept users subscribed and engaged while their card issue got fixed, instead of locked out and drifting away.

## What to actually do about it

1. **Check your actual grace period and account hold settings.** Not just the fact that 60 days exists. The default changed. Your own split between the two phases may not have.
2. **Favor a longer grace period if keeping users during the fix matters most.** A user who keeps access while their card gets sorted is far more likely to finish that fix.
3. **Don't assume the new default does the heavy lifting alone.** Reported gains tie to developers who set both values on purpose. Not to the longer window by itself.
4. **Re-check these settings directly in Play Console.** Billing and recovery details are worth confirming firsthand. Not just trusting a summary, this one included.

[AppRankr's Rank Tracker](/rank) tracks your real Google Play visibility. Subscription recovery lives entirely on the billing side, separate from ranking. But a churn problem quietly draining revenue is just as worth catching early as a ranking one.

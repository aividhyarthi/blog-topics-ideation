---
title: "Does Your App's Download Size Actually Affect Conversion Rate?"
description: "Google published a real number on this back in 2017. Apple never has. Here's the actual data, how old it is, and why the same logic doesn't automatically carry over to iOS."
theme: "Conversion & Growth"
image: "/blog/og/does-app-size-affect-conversion-rate.png"
publishDate: 2026-09-07
faqs:
  - question: "Does a bigger app size really hurt install conversion?"
    answer: "On Android, Google published real data on this: for every 6 MB increase in APK size, install conversion rate dropped by about 1%. That data is from 2017, though, so treat the exact number as dated even if the general direction likely still holds."
  - question: "Does Apple publish similar data for iOS?"
    answer: "No. Apple documents the mechanics of app thinning and on-demand resources, and sets a hard 2 GB limit for certain bundle configurations, but has not published controlled data linking app size to install conversion or App Store ranking the way Google has for Android."
  - question: "Does smaller app size directly improve App Store ranking?"
    answer: "That specific claim, that a smaller app ranks higher, isn't documented by either platform. What's documented is a conversion-rate effect on Android specifically. Ranking and conversion rate are related but different things, and conflating them overstates what's actually been shown."
---

**Key points:**
- Google published real, named data on this back in 2017. Every 6 MB increase in Android APK size lined up with roughly a 1% drop in install conversion rate.
- In emerging markets specifically, Google found that removing 10 MB from download size lined up with about a 2.5% rise in conversion. A bigger effect than in richer markets.
- Apple has never published anything like this. Its own docs cover app thinning and on-demand resources, plus a 2 GB limit for some setups, but no conversion study.
- "Smaller apps rank higher" is a bigger claim than what's actually proven. The real data is about conversion on Android. Not App Store search rank on either platform.

App size shows up constantly in ASO advice. Usually stated as flat fact. Here's the part that often gets left out. There's one real, named source behind the Android number. It's older than most of the apps citing it today.

## The actual Google data, and how old it is

In a 2017 post on the official Google Play blog, Google engineer Sam Tolomei shared a specific, named number. For every 6 MB increase to an APK's size, Google saw roughly a 1% drop in install conversion rate. In emerging markets specifically, where storage and connectivity matter more, cutting 10 MB from a download lined up with about a 2.5% rise in conversion. A clearly bigger effect than in richer markets.

That's a real, named number from Google itself. Not an ASO vendor's guess. It's also from 2017. Phones carry more storage now. Average connection speeds have gone up in most places since then. The direction of the effect, bigger downloads costing you some installs, is fair and widely repeated for good reason. Just treat the exact "1% per 6 MB" figure as a historical data point. Not a live, current benchmark.

## Apple's side of this is much thinner

Apple's own docs explain app thinning and on-demand resources in real technical detail. Including a hard 2 GB limit for bundles using on-demand resources. What Apple hasn't published is anything like Google's real conversion study. No named percentage. No emerging-market breakdown. Nothing tying iOS app size directly to install conversion or search rank.

That gap matters. A lot of ASO advice treats "keep your app small" as an equal rule on both platforms. The evidence is real on Android. On iOS, it's a borrowed assumption. Not a documented iOS-specific finding.

| Claim | Documented? |
|---|---|
| Bigger APK size lines up with lower install conversion (Android) | Yes, Google, 2017 |
| Effect is bigger in emerging markets (Android) | Yes, Google, 2017 |
| Equivalent data exists for iOS | No |
| Smaller app size directly improves App Store search rank | Not documented by either platform |

## Rank and conversion aren't the same claim

Worth splitting apart here. Google's data is about conversion rate. The share of people who see your listing and install it. It says nothing about search rank directly. A smaller app that converts better might get some indirect rank benefit, if install speed feeds into rank signals somewhere. But that's a chain of two separate, loosely linked effects. Not one single, documented "smaller app ranks higher" rule.

> **Real-world scenario:** A photo-editing app's Android build had grown past 90 MB after several feature additions. Most of that weight was filter assets, loaded upfront whether a user touched them or not. The team moved most of those assets to on-demand delivery. That cut the initial APK download to about 55 MB. Over the next month, install conversion in their biggest market rose by roughly 4%. Roughly in line with the direction Google's own data suggested, even though the team never set out to hit that exact number. Their keyword rankings didn't move right away, since nothing about their metadata or relevance had changed. The conversion lift alone was worth the engineering time.

## What to actually do with this

1. **Check what's actually loaded upfront versus what could ship on-demand.** On both platforms, whether or not you remember Google's exact 2017 number.
2. **Don't read Apple's silence as proof there's no effect on iOS.** It's more likely just under-studied in public than genuinely absent.
3. **Split the conversion question from the rank question.** A size cut is a real, testable conversion lever. Treat any specific rank claim tied to it with real doubt.
4. **Measure your own before-and-after conversion rate after a real size cut.** The exact effect for your app and market is what actually matters. Not a decade-old average.

[AppRankr's ASO Inspector](/aso) helps you track the listing-level changes that matter. [Rank Tracker](/rank) shows whether your real keyword positions moved after a change like this. Not just whether they should have, in theory.

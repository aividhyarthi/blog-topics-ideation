---
title: "Grab Cut Its ANR Rate 32% With Free Android Tooling. Here's What They Changed"
description: "Google's own developer blog details how Grab cut ANRs by about a third and improved cold start by 35%, using R8 Full Mode and Baseline Profiles. Here's exactly what they did."
theme: "App Quality & Vitals"
keyword: "R8 Baseline Profiles ANR case study"
image: "/blog/og/grab-r8-baseline-profiles-anr-case-study.png"
publishDate: 2026-10-21
faqs:
  - question: "What exactly did Grab change to cut its ANR rate?"
    answer: "Per Google's own developer blog, Grab moved to R8 Full Mode, added custom Baseline Profiles covering critical user journeys like Dagger dependency graph initialization, and refined keep rules using the R8 Configuration Analyzer. The cumulative result, across all phases, was about a 32.5% cut in user-perceived ANRs."
  - question: "Does this directly prove ANR fixes improve Google Play ranking?"
    answer: "Not on its own. Google's own post about Grab reports the ANR, size, and startup numbers but says nothing about search ranking or visibility impact specifically. Separately, Google Play's own Android vitals documentation confirms ANR rate as a tracked quality metric with a bad-behavior threshold tied to reduced visibility, which is where the ranking connection actually comes from."
  - question: "What tool did Grab use to measure keep-rule quality?"
    answer: "Per Google's own post, the R8 Configuration Analyzer. Grab's scores moved from 72% to 78.2% on Optimization, 73% to 79.1% on Shrinking, and 79.6% to 81.7% on Obfuscation after their keep-rule refinement phase."
---

**Key points:**
- Google's own [developer blog post](https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time), dated October 19, 2026, reports Grab cut user-perceived ANRs by about 32.5%, download size by about 30.4%, and cold start time by about 35%.
- Per Google's own account, the two core techniques were R8 Full Mode and custom Baseline Profiles, rolled out in phases over about nine months.
- The R8 Configuration Analyzer, a free tool, measured keep-rule quality before and after refinement.
- Google's own post doesn't claim this moved Grab's search ranking directly. ANR rate's tie to Play visibility comes from Google Play's own separate Android vitals documentation.

A 32% cut in ANRs sounds abstract. See the two actual changes behind it, and it gets concrete fast. Google's own case study on Grab names both.

## The numbers, phase by phase

Per Google's own post, the improvement came in stages, not one single change.

| Phase | ANRs | Size | Cold start |
|---|---|---|---|
| R8 Optimizer (2025) | About 25% cut | 16% cut | About 27% faster |
| R8 Full Mode (2026) | 10% further cut | 14% further cut | 10% further gain |
| Keep-rule refinement | Not separately broken out | 3.6% further cut | Not separately broken out |
| Cumulative total | About 32.5% cut | About 30.4% cut | About 35% faster |

## The two real techniques behind the number

Per Google's own account, Grab first swapped a legacy default ProGuard file for `proguard-android-optimize.txt`. That one switch turns on R8's real optimizations, not just basic shrinking. Paired with Baseline Profiles, it delivered the first jump. A custom Baseline Profile covered slow paths that Google Play's own automatic Cloud Profiles missed. Grab's own example: Dagger dependency setup at launch. Per Google's own explanation, a path with no Baseline Profile waits on the device to compile it on the fly, then slowly tune it over days of real use. A Baseline Profile skips that wait. The critical path compiles to machine code right at install, no waiting required.

The second big jump came nine months later. Grab switched to R8 Full Mode. Per Google's own post, this took real work on their side too. It included fixing crashes caused by Java dynamic proxies, done by writing narrow, targeted keep rules instead of broad blanket exceptions.

> **Real-world scenario:** A team saw ANR spikes with every weekly release, per Google's own description of Grab's starting point. Rather than chase individual crash reports one by one, they treated it as a build setting problem first. Switching to R8 Full Mode, plus a Baseline Profile for just the app's slowest cold-start path, cut a real chunk of ANRs. No application code touched at all. The rest of the gain came later, from actually measuring keep-rule quality with a real tool, not guessing which rules still mattered.

## What Google's own post does and doesn't claim

Worth being exact here. Google's own blog post reports ANR rate, app size, and cold start gains. It says nothing about Grab's search ranking or store visibility moving because of this. The ranking link comes from a separate, well-known fact instead. Google Play's own Android vitals docs list ANR rate as a tracked metric with a real bad-behavior threshold. Cross it, and visibility drops in Play Store search and browse. The numbers and techniques here are real and sourced. The ranking link is real too. It just comes from a different Google page, not this one.

## What to actually do about it

1. **Check whether you're still on R8 Compat mode instead of Full Mode.** Per Google's own post, Full Mode was the second major jump, after basic R8 optimization was already live.
2. **Look for your own uncovered cold-start paths.** Google Play's Cloud Profiles cover common cases automatically. A custom Baseline Profile exists specifically for the paths that aren't common, like your own app's specific dependency injection setup.
3. **Measure your keep rules instead of assuming they're fine.** The R8 Configuration Analyzer gave Grab real percentage scores to improve against, not a guess.
4. **Don't expect an instant search ranking bump from this alone.** Fix ANR rate because Android vitals tracks it with a real threshold, confirmed separately from this case study.

[AppRankr's Rank Tracker](/rank) tracks your real Google Play visibility over time, a useful way to watch whether a quality fix like this one correlates with anything on your own listing.

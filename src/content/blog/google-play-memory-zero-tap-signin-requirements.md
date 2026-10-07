---
title: "Google Play's New Memory and Zero-Tap Sign-In Requirements, With the Exact Numbers"
description: "Google's own August 2026 announcement adds two new quality bars beyond crash and ANR rate: memory usage thresholds in February 2027, and a Zero-Tap Sign-In standard for device migration in April 2027."
theme: "App Quality & Vitals"
keyword: "Google Play memory zero-tap sign-in"
image: "/blog/og/google-play-memory-zero-tap-signin-requirements.png"
publishDate: 2026-10-07
faqs:
  - question: "What are Google Play's new memory requirements?"
    answer: "Per Google's own August 2026 announcement, three metrics. Dynamic memory usage, meaning Anonymous RSS plus Swap. Bitmap memory usage. And DEX code optimization, which needs at least 25% coverage. Enforcement starts February 2027."
  - question: "What is Zero-Tap Sign-In Restoration?"
    answer: "Google's own name for a new standard, built on the Android Restore Credentials API. It signs a user back into an app on a new device, with no extra tap. It applies to any app with sign-in. Enforcement starts April 2027. Games are exempt for now."
  - question: "What happens if an app doesn't meet these thresholds?"
    answer: "Per Google's own wording, apps that miss the memory bar may see reduced visibility and publishing limits, starting February 2027. Missing Zero-Tap Sign-In by April 2027 means losing full publishing rights and the best Play Store visibility."
---

**Key points:**
- Google's own [August 2026 Android Developers Blog post](https://developer.android.com/blog/posts/elevating-app-quality-reducing-memory-usage-and-improving-device-migration) adds new rules. Memory thresholds, plus a sign-in rule for new devices.
- These sit apart from the existing crash and ANR rate bars. A separate set of checks.
- Memory rules cover three things. Memory use, bitmap use, and code optimization at 25% or higher. The deadline is February 2027.
- A sign-in rule, Zero-Tap Sign-In, follows in April 2027. New tools for all of this are already live in Android vitals.

Crash rate and ANR rate were never the whole picture. Google's own August 2026 post adds two more bars. Both come with real numbers.

## The three memory checks, in plain terms

Google's own post names three specific things it now checks. First: how much memory an app's own data uses. Active memory plus compressed memory together. Google calls this Anonymous RSS plus Swap. Files like code and images stored on the device don't count toward this number.

Second: bitmap memory. This checks one narrow thing. Does an app keep images loaded in memory after it moves to the background? It shouldn't. A bitmap should clear once a screen isn't in view.

Third: code optimization. This one has a hard floor. At least 25% of an app's code needs to pass through a shrinking and obfuscation tool, such as R8. Below that line, the app fails this check.

| Check | What it looks at | Deadline |
|---|---|---|
| Memory use (RSS + Swap) | An app's own data in memory | February 2027 |
| Bitmap memory | Images left loaded in the background | February 2027 |
| Code optimization | 25%+ coverage via R8 or similar | February 2027 |
| Zero-Tap Sign-In | Auto sign-in on a new device | April 2027 |

## Why the sign-in rule comes later, and works differently

The memory checks are about app performance. Zero-Tap Sign-In is a different kind of rule. It's built on the Android Restore Credentials API. Any app with sign-in, whether required or optional, needs to support it. The deadline is April 2027. Two months past the memory deadline.

The goal is simple. Someone buys a new Android phone. They open your app. They're already signed in. No extra tap, no re-entering a password. Games don't need to meet this bar yet, though Google says game studios should still plan for it. More guidance for games is coming later.

The two deadlines don't carry the same penalty. Miss the memory bar by February 2027, and Google's own words point to reduced visibility and tighter publishing limits. Miss Zero-Tap Sign-In by April 2027, and the loss is bigger: full publishing rights and top-tier visibility both take a hit. Neither one means an app gets pulled.

> **Real-world scenario:** A team had already fixed their crash rate and ANR rate. They thought their quality work was finished. Then they read Google's own August 2026 post and checked the new memory tools in Android vitals. One screen kept old images loaded long after a user left it, even with the app in the background. They fixed that leak. Separately, since their app requires sign-in, they started the Restore Credentials API work early, well ahead of the April 2027 cutoff.

## What to actually do about it

1. **Open Android vitals and look at the new memory breakdowns now.** Google's own tools already split this out by device type and percentile.
2. **Run your code through R8 if you haven't.** 25% coverage is a real, checkable number. Not a vague goal.
3. **Start the sign-in work early if your app has accounts.** April 2027 isn't far behind February 2027, and most apps won't get an exemption.
4. **Don't assume a clean crash rate covers this too.** These are new, separate checks. Clearing the old bar says nothing about the new one.

[AppRankr's Rank Tracker](/rank) tracks your visibility trends over time, a useful way to catch an early dip before a quality deadline like this one makes it worse.

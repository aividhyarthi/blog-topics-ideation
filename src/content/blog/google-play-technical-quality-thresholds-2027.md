---
title: "Google Play's New Crash and ANR Thresholds, With the Exact Numbers"
description: "Google announced real, numeric technical quality thresholds in August 2026, taking effect February 2027. Here's exactly where the lines sit, for crash rate and ANR rate alike."
theme: "App Quality & Vitals"
keyword: "Google Play technical quality thresholds"
image: "/blog/og/google-play-technical-quality-thresholds-2027.png"
publishDate: 2026-09-29
faqs:
  - question: "What are Google Play's new crash rate thresholds?"
    answer: "Per Google's own August 2026 announcement: a user-perceived crash rate of 1.09% overall, averaged across devices. Per-model limits sit higher. 8% for a phone model, 4% for a watch model. A single device model's own bad run shouldn't sink an otherwise healthy app."
  - question: "What are the new ANR (App Not Responding) thresholds?"
    answer: "A user-perceived ANR rate of 0.47% overall, per Google's own numbers. Per-model limits are 8% for phones and 5% for watches. Same tiered structure as the crash rate thresholds."
  - question: "When do these thresholds actually take effect?"
    answer: "Google announced them August 26, 2026. Enforcement starts February 2027. That's real lead time to check your current numbers and fix what needs fixing first."
---

**Key points:**
- Google's own August 2026 announcement sets a real, numeric bar. 1.09% overall user-perceived crash rate. 0.47% overall user-perceived ANR rate.
- Per-device-model limits sit higher than the overall bar. 8% crash rate and 8% ANR rate for a single phone model. 4% and 5% for a single watch model.
- These are discoverability thresholds, not automatic removal. Cross them and Google's own wording describes reduced discoverability. Not a takedown.
- Enforcement starts February 2027. Google announced this in August 2026. Real lead time to check current numbers first.

"Keep your crash rate low" has always been vague advice. Google just replaced it with an actual number. For both crash rate and ANR rate alike.

## The exact thresholds, in one place

Google's own announcement names real numbers, not a vague quality bar. Averaged across every device your app runs on, crash rate needs to stay under 1.09%. ANR rate under 0.47%. Per-model limits sit higher. One weak phone model shouldn't sink an app that's healthy everywhere else.

| Metric | Overall limit | Per phone model | Per watch model |
|---|---|---|---|
| User-perceived crash rate | 1.09% | 8% | 4% |
| User-perceived ANR rate | 0.47% | 8% | 5% |

## Why the two-tier structure matters

An app can look healthy on average while quietly failing hard on one less common device model. The per-model limits exist to catch that. A device with a real hardware issue, an older chip, a specific brand's software layer, can push crash or ANR numbers far above the average. The overall number barely moves. Especially for an app spread across hundreds of device models.

That's why the per-model limits sit so much higher than the overall ones. A few users on one rare model hitting real trouble is expected sometimes. The overall number is where the real risk lives. It reflects what most of your users actually experience.

> **Real-world scenario:** A team checked their Android Vitals dashboard after Google's August 2026 announcement. Their overall crash rate sat comfortably under 1.09%. Digging into per-model data, one older, less common phone model showed a crash rate well above 8%, tied to a real hardware compatibility issue. Their aggregate number looked fine. That one model was already failing the new per-model threshold. They shipped a targeted fix for that hardware configuration well before the February 2027 enforcement date. They didn't wait for it to show up as a real discoverability hit.

## What to actually do about it

1. **Check both your overall and per-model numbers now, not in 2027.** Google gave real lead time between the August 2026 announcement and February 2027 enforcement. Use it.
2. **Don't stop at the aggregate crash rate.** A per-model spike can hide inside a fine-looking overall average. Especially on a large, device-diverse install base.
3. **Treat ANR rate with the same seriousness as crash rate.** Both have their own explicit threshold now. A freezing app that never technically crashes is still a real problem under these numbers.
4. **Prioritize fixes on your highest-install device models first.** A fix on a widely used model moves your real numbers more than the same effort on a rare one.

[AppRankr's Rank Tracker](/rank) tracks your visibility over time. You can see directly whether a technical quality fix like this one actually shows up as a real discoverability change, not just a number on a dashboard.

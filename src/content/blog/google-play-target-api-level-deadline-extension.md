---
title: "Missed Google Play's Target API Level Deadline? The Extension Window Closes Nov 1"
description: "Google's target API level requirement took effect August 31, 2026. If you haven't updated yet, there's a real extension window, but it closes November 1. Here's exactly what's required and who's exempt."
theme: "Google Play"
keyword: "Google Play target API level deadline"
image: "/blog/og/google-play-target-api-level-deadline-extension.png"
publishDate: 2026-10-08
faqs:
  - question: "What is Google Play's target API level requirement right now?"
    answer: "Per Google's own documentation, new apps and updates need to target Android 16 (API 36) as of August 31, 2026. Wear OS and Android Automotive OS need API 35. Android TV and Android XR need API 34. Existing apps need API 35 to stay visible to new users on newer devices."
  - question: "Is there still time if I missed the August 31 deadline?"
    answer: "Yes, per Google's own page. An extension to November 1, 2026 is open. After that date, no extension is mentioned."
  - question: "What actually happens to an app that doesn't meet the requirement?"
    answer: "Per Google's own wording, an old app becomes unavailable to new users on devices running a newer Android version. Existing installs aren't addressed on the page. The one listed exemption is a permanently private, organization-only app for internal use."
---

**Key points:**
- Google's own [target API level requirement](https://developer.android.com/google/play/requirements/target-sdk) took effect August 31, 2026. Most apps need Android 16 (API 36).
- Live apps need API 35 or higher to stay visible to new users on newer phones.
- An extension to November 1, 2026 is open, per Google's own page, for anyone who hasn't updated yet.
- The one listed exemption: a private app limited to one organization's internal use.

August 31 already passed. If your app still isn't there, the real deadline now is November 1.

## The actual numbers, by app type

Google's own rule isn't one number. It shifts by app type.

| App type | Minimum target API level |
|---|---|
| Most apps | Android 16 (API 36) |
| Wear OS, Android Automotive OS | Android 15 (API 35) |
| Android TV, Android XR | Android 14 (API 34) |

That's the bar for new apps and new updates. A separate, lower bar covers apps already live. Those need API 35 or higher just to stay visible to new users on a newer phone. Falling short there isn't about a blocked update anymore. It's about users finding the app at all.

## What "unavailable to new users" actually means

Per Google's own words, an old app goes dark for new users. Specifically, for anyone on a phone running a newer Android version than the app targets. In plain terms: an app targeting Android 14 or lower stops showing up on a newer device. That line shifts for some device types too. Android 13 or lower for Wear OS, Android TV, and Android XR. Android 12 or lower for Android Automotive OS.

The page never says what happens to people who already have the app installed on a newer phone. Read that gap as genuinely open. Not as a quiet yes or no either way.

> **Real-world scenario:** A small team shipped their last update in early 2026. Well before August 31 became a firm date. They figured an old app that still worked fine for current users was safe to leave alone. They checked Google's own page in October and found their target sat two versions behind the new-user bar. New installs on recent phones had quietly stopped. They asked for the extension, planned a small, low-risk bump to the target level, and shipped it before the November 1 cutoff.

## What to actually do about it

1. **Check your current target level today, not after November 1.** The extension window is real. It won't stay open forever.
2. **Know which bar applies to your app.** Wear OS, Automotive, TV, and XR each sit on a different number than most apps.
3. **Treat live-app visibility as its own problem.** An app you never plan to touch again can still lose new-user visibility if its target level falls behind.
4. **Don't assume you're exempt.** The only exemption listed is a private app limited to one organization. Nearly everything else is in scope.

[AppRankr's Rank Tracker](/rank) tracks your visibility trends over time, a useful way to catch a new-user visibility drop early instead of finding out the hard way.

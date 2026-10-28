---
title: "Google Play Instant Is Retired. Here's What Replaces the 'Try Now' Button"
description: "Google's own developer docs confirm Google Play Instant stopped working in December 2025. If your app still ships an instant experience, here's the real migration path."
theme: "Google Play"
keyword: "Google Play Instant retired"
image: "/blog/og/google-play-instant-apps-retired.png"
publishDate: 2026-10-28
faqs:
  - question: "Is Google Play Instant actually gone?"
    answer: "Yes, per Google's own developer docs. Starting December 2025, instant apps can't be published through Google Play, and every Google Play services Instant API stops working."
  - question: "What's the replacement for the 'Try Now' experience?"
    answer: "There isn't a direct one. Google's own guidance points developers to the full app instead, using deep links to send users straight to a specific screen or feature rather than a trial-without-install flow."
  - question: "Do I need to change my build setup if I had an instant app module?"
    answer: "Likely yes, if you used the old feature plugin. Google's own migration docs say to switch from the deprecated com.android.feature plugin to com.android.application and com.android.dynamic-feature."
---

**Key points:**
- Google's own developer docs confirm that starting December 2025, instant apps can no longer publish through Google Play, and all Google Play services Instant APIs stop working.
- Google's own guidance: Play "will no longer serve Instant Apps in any form."
- The recommended path is sending users to your real app instead, using deep links to a specific screen, not a trial-without-install flow.
- If your build still uses the old com.android.feature plugin, Google's own migration docs say to move to com.android.application and com.android.dynamic-feature.

A "Try Now" button many users never noticed quietly stopped working across the whole Play Store. If your app still ships one, it's not doing anything anymore.

## What Google's own docs actually confirm

Per Google's own developer documentation, Google Play Instant stopped accepting new publishes in December 2025. Every related API in Google Play services, the ones instant apps relied on, stopped working the same month. Google's own words are direct. Play "will no longer serve Instant Apps in any form."

| Detail | What Google's own docs confirm |
|---|---|
| Cutoff date | December 2025 |
| Publishing | No longer possible through Google Play |
| APIs | All Instant-related APIs stopped working |
| Old build plugin | com.android.feature, now deprecated |

## Why this quietly mattered more than it looked

A "Try Now" button let a user run part of an app with no install at all. Some teams built real funnels around it. A game demo. A one-screen trial of a paid feature. None of that runs anymore. Even if the button or the code still sits in an old build. A user tapping a dead instant-app link today just hits nothing. Not a graceful fallback. That's a real, silent gap. Especially if your store listing or old marketing links still point at one.

> **Real-world scenario:** A shopping app had built a lightweight instant experience years back, letting a user browse a few product pages before deciding to install. Nobody on the current team remembered it existed until a support ticket came in about a broken link from an old email campaign. Checking Google's own docs, they confirmed the feature was fully retired, not just buggy. They swapped the dead instant-app link for a deep link straight into their real app's product page instead, the path Google's own guidance actually points to now.

## What actually replaces it

Google doesn't offer a direct swap. Its own guidance is to send users to your real app instead. Use deep links that open a specific screen or feature "when relevant." That's a narrower experience than a full no-install trial. But it's the supported path now. If your project still carries the old com.android.feature plugin for an instant module, Google's own migration docs describe the fix. Move to com.android.application for the base app. Move to com.android.dynamic-feature for any feature modules. The same setup a normal App Bundle already uses.

## What to actually do about it

1. **Search your own marketing links and store listing for anything pointing at an old instant-app URL.** Those links go nowhere useful now.
2. **Check your build config for the deprecated com.android.feature plugin.** If it's still there, Google's own migration path is the base app plugin plus dynamic-feature modules.
3. **Replace any "try before install" funnel with a deep link into your real app.** Aim it at the specific screen that mattered in your old instant flow.
4. **Don't expect a direct no-install replacement.** Google's own current guidance treats this as retired, not as a feature pending a sequel.

[AppRankr's Rank Tracker](/rank) tracks your actual visibility and listing health, worth a check if an old feature like this has been quietly broken on your listing.

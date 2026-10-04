---
title: "App Store Connect Now Lets You Submit Multiple Review Items as One Package"
description: "In-App Purchases, In-App Events, custom product pages, and product page tests used to mean separate submissions with separate statuses. Apple's own update lets you group them into one, with one status view."
theme: "App Store"
keyword: "App Store Connect combined submission"
image: "/blog/og/apple-app-store-connect-combined-submission.png"
publishDate: 2026-10-04
faqs:
  - question: "What is combined submission in App Store Connect?"
    answer: "Per Apple's own announcement, it's a way to group review items together as one package. In-App Purchases can now be submitted alongside In-App Events, custom product pages, and product page optimization tests, with Apple reviewing them together and showing one combined status."
  - question: "Do I have to use combined submission, or can I still submit things separately?"
    answer: "Apple's own update keeps the old workflow available. Independent custom product page submission still works on its own. Combined submission is an added option, not a replacement for the existing process."
  - question: "Where can I actually use this?"
    answer: "Per Apple's own description, the combined submission workflow is available in App Store Connect on the web and through the App Store Connect API."
---

**Key points:**
- Apple's own update lets you group In-App Purchases with In-App Events, custom product pages, and product page optimization tests into one package.
- Apple reviews the grouped items together. You get one combined status, not separate ones for each piece.
- Independent custom product page submission still works on its own. This is an added option, per Apple's own description. Not a replacement.
- Available in App Store Connect on the web, and through the App Store Connect API. Per Apple's own announcement.

Submitting an In-App Purchase alongside a new custom product page used to mean tracking two separate review statuses. Apple's own update lets you submit both as one.

## What actually changed

Apple's own announcement describes a real grouping option inside App Store Connect. You can now combine an In-App Purchase with other review items. In-App Events. Custom product pages. Product page tests. All in one package. Apple reviews the group together. You check one combined status, not several separate ones.

| Before | After |
|---|---|
| Separate submission per item | One combined package |
| Separate status to track per item | One combined status view |
| Independent custom product page submission | Still available, unchanged |

## Why tracking one status actually matters

A launch that bundles a new In-App Purchase with a matching custom product page and a tied-in event used to mean watching three separate review pipelines. Each on its own clock. Each able to land at a different time. Keeping a clean launch across all three meant tracking each one by hand to see if it had cleared review yet.

Combined submission removes that problem directly. Review items tied to one launch now move through App Store Connect together. Messages from App Review show up in one place. That's real time saved on a launch with several review pieces moving at once. Not just a cosmetic dashboard change.

> **Real-world scenario:** A team planned a feature launch pairing a new In-App Purchase with a custom product page built to promote it, plus an In-App Event tied to the same release window. Under the old process, they'd tracked three separate review statuses by hand, checking each one daily to line up a simultaneous go-live. Using combined submission for this launch, they submitted all three as one package and watched a single status update. All three cleared review together. No more manual status-checking.

## What to actually do about it

1. **Group review items that genuinely launch together.** An In-App Purchase, its matching custom product page, and a tied-in event fit exactly what this is built for.
2. **Keep using separate submission for anything that doesn't need lined-up timing.** Apple's own update keeps that path open, since not everything needs to move together.
3. **Check the App Store Connect API if you manage submissions programmatically.** Apple's own description confirms the combined workflow works there too. Not just on the web.
4. **Use the single status view to simplify your own launch tracking.** One place to check instead of several review pipelines cuts real coordination work on launch day.

[AppRankr's ASO Inspector](/aso) reviews your live listing once a launch goes through, a useful next check after a coordinated submission like this one clears review.

---
title: "How to Track Competitor Apps the Right Way"
description: "The most common mistake in competitive ASO tracking isn't picking the wrong rivals. It's accidentally tracking your own sister apps as if they were competitors."
theme: "Fundamentals"
image: "/blog/og/tracking-competitor-apps-the-right-way.png"
publishDate: 2026-07-14
faqs:
  - question: "Should I track apps from the same company as competitors?"
    answer: "No. Apps published by the same developer account aren't competing with you for a customer's attention or install decision the way an outside rival is. They're portfolio siblings. Comparing your rank against your own other app tells you nothing useful about competitive pressure in the category."
  - question: "How do I know if two apps are actually made by the same company?"
    answer: "Both Google Play and the App Store expose a stable publisher identifier per app (Play's developer ID, the App Store's artist ID) independent of the developer's display name, which can vary or be styled differently across their own apps. Matching on that identifier, not on name similarity, is the reliable way to tell."
---

Ask most app owners who their competitors are and you'll get a confident, specific list. Ask an ASO tool to *find* competitors automatically, and the naive version of that feature will often hand back a list padded with your own other apps. Which isn't a competitor set, it's your own portfolio.

## Why this mistake is so easy to make

Automatic competitor discovery usually works by scanning who else ranks for your core keywords, or who Google/Apple lists in "similar apps." Both signals are legitimate starting points, and both will just as happily surface an app from your own company if you or your team ship more than one product in the same category, or if your apps share enough branding/description language to look similar to the matching algorithm.

The result looks plausible at a glance: a list of apps, all seemingly in your space, all seemingly worth tracking. It's only when you notice the "competitor" ranking suspiciously well for every one of your own core terms (because it's your other app) that the problem becomes obvious.

## The signal that actually works: publisher identity, not name matching

Matching on developer *display name* fails constantly, the same company often styles its name differently across listings ("Acme Inc.", "Acme", "Acme Studio"), and plenty of unrelated developers use generic, similar-sounding names. What doesn't drift is the underlying **publisher identifier** both stores attach to every listing: Google Play's developer ID and the App Store's artist ID. Two apps sharing that identifier are, unambiguously, published by the same account, regardless of what either one calls itself.

| Signal | Reliable? | Why |
|---|---|---|
| Developer display name | No | Same company can style it differently per app; unrelated developers can share generic names |
| "Similar apps" store suggestion | Partial | Reflects category/behavior similarity, not competitive relationship. Can include your own other apps |
| Publisher ID (developer ID / artist ID) | Yes | Stable, store-assigned, identical across every app from the same account |

> **Real-world scenario:** A mutual-fund app's auto-discovered competitor list included a "budget tracker" app that consistently ranked #1-2 on nearly every one of the fund app's core keywords, flagged internally as "the one to beat." It turned out to be the same company's own budgeting product, sharing the developer account, comfortably outranking the fund app on shared branding terms simply because it had been live longer. Once the list was filtered to actual outside publishers, the real #1 competitor (a rival fund-tracking app with no shared ownership) had been sitting several rows down the whole time, unnoticed because the false "competitor" was so visually dominant at the top of the table.

## Building a competitor set you can trust

1. **Filter any auto-discovered list by publisher ID first**, before you even look at ranks, remove anything sharing your own account's identifier.
2. **Add rivals deliberately**, not just algorithmically, [pull in the 2-3 apps you already know you're competing with for install decisions](/rank), even if they don't show up in an automatic scan.
3. **Re-check the filter periodically**, not just once, companies acquire or launch new apps, and a rival today can become an unrelated app tomorrow (or vice versa) if ownership changes.
4. **Use the same keyword set across the whole comparison**: a side-by-side comparison is only informative if every app in it is being measured against the identical list of terms, not whatever each one happens to already track.

The point of competitive tracking is to know where you stand against people actually trying to win the same customer. A list quietly padded with your own apps doesn't just fail to answer that question. It actively hides the real answer underneath a false sense of "we're already #1 here."

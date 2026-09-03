---
title: "Why a Competitor Outranks You When Someone Searches Your Own App Name"
description: "Someone searches your app's exact name and a rival shows up above you. That's not a fluke — it's a competitor stuffing your brand name into their own metadata, and both platforms actually ban it."
theme: "Keywords"
image: "/blog/og/competitor-using-your-app-name-in-their-keywords.png"
publishDate: 2026-09-03
faqs:
  - question: "Is it against the rules for a competitor to use my app's name in their keywords?"
    answer: "On Apple's platform, yes — Guideline 2.3.7 explicitly bans packing metadata or keywords with trademarked terms that aren't yours, just to game search. Google Play's policy is less explicit about keywords specifically, since Play doesn't have a discrete keyword field, but its Metadata and Impersonation policies cover the same misleading intent."
  - question: "How do I even know this is happening to me?"
    answer: "Search your own exact app name in the store and look at what shows up above you. If a rival with a similar or unrelated app consistently outranks your branded search, and their listing text mentions your name or a close variant, that's the pattern."
  - question: "What can I actually do about it?"
    answer: "On Apple, you can file a trademark complaint through their official IP dispute form. On Google Play, report it under the Impersonation or Intellectual Property policy. Neither is instant, but both are real, documented channels — not a dead end."
---

**Key points:**
- Apple's own [Guideline 2.3.7](https://developer.apple.com/app-store/review/guidelines/) bans stuffing your keywords with trademarked terms "just to game the system." A rival doing this to your brand name breaks this rule directly.
- Real developers have hit this exact wall. One [Apple forum thread](https://developer.apple.com/forums/thread/73841) describes a well-known, uniquely-named app still losing its own branded search to a rival who keyword-stuffed and outspent them on ads.
- Google Play's [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842) and [Impersonation policy](https://support.google.com/googleplay/android-developer/answer/9888374) cover the same ground. Google's wording is a bit less exact about keywords than Apple's, though.
- Both platforms have a real complaint channel. [Apple's IP dispute form](https://www.apple.com/legal/intellectual-property/dispute-forms/app-store/) and Google's policy reporting flow. Neither is instant. Neither is a dead end.

You search your own app's exact name. Not a category term. Not some generic keyword. Your name. A rival shows up above you anyway. Maybe they're in a similar space. Maybe their listing text even names your app, or something close to it. This isn't a fluke in the algorithm. It's a real rule violation on at least one platform. There's a real path to fixing it too.

## What Apple's rules actually say

Apple's own rules are direct here. [Guideline 2.3.7](https://developer.apple.com/app-store/review/guidelines/) tells developers to pick a unique name. Use real keywords. Don't pack your metadata with other apps' names "just to game the system." Apple adds that it "may modify inappropriate keywords at any time" to stop this.

That's not a vague, read-between-the-lines rule. Stuffing a rival's name into your keywords to catch their branded search is exactly what this guideline names and bans.

Two more rules back it up. **Guideline 4.1(b)** bans apps that impersonate other apps. **Guideline 4.1(c)** bans using another dev's brand or name in your icon or title without permission. All three together cover most versions of this problem.

## What Google Play's rules say

Google Play works a bit differently. There's no separate "keyword field" like Apple has. Your ranking runs off your title and description text instead. Google's wording is a step less exact on this issue because of that. It still covers the same ground, through two policies:

- The [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842) tells developers to skip "misleading or irrelevant references to other apps." It warns against naming a competitor's brand without a real, policy-safe reason.
- The [Impersonation policy](https://support.google.com/googleplay/android-developer/answer/9888374) bans presenting your app as the official version of someone else's product.

Worth being honest here. Google's rules are real and on-topic. They're just less crisp than Apple's dedicated keyword-stuffing clause. Don't tell a client the two platforms treat this the same way. They don't.

| Platform | Specific rule | How direct is it |
|---|---|---|
| Apple | Guideline 2.3.7 | Names keyword-stuffing with trademarked terms directly |
| Apple | Guidelines 4.1(b) / (c) | Bans impersonation and unauthorized brand use |
| Google Play | Metadata + Impersonation policies | Covers the same intent, less exact on keywords |

## Developers have hit this exact wall

This isn't a hypothetical case. On the [Apple Developer Forums](https://developer.apple.com/forums/thread/73841), one developer described this exact pattern. Their app had a genuinely unique name and solid reviews. It still lost its own branded search to a rival. That rival had stuffed the name into their keywords and backed it with ad spend. Users searching for the ORIGINAL app kept landing on the wrong install instead. A [related thread](https://developer.apple.com/forums/thread/111168) asks the same question from a different developer: what can you actually do about this?

> **Real-world scenario:** A budgeting app with a made-up, distinctive name noticed a new rival beating them, every time, on searches for their own exact name. The rival's short description named the original app almost word for word. It was framed as "similar to [name]." The original developer filed a trademark complaint through Apple's IP dispute form. Apple contacted the other developer directly. Within three weeks, the rival had edited their metadata to drop the name reference. The original app's branded search results recovered fully within days. No keyword or ranking change was needed on their own side at all.

## What to actually do about it

1. **Confirm the pattern first.** Search your exact app name. Note who outranks you, and whether their listing text names you or something close to it.
2. **On Apple:** File through the [official IP dispute form](https://www.apple.com/legal/intellectual-property/dispute-forms/app-store/). You'll need to verify you hold the trademark. Apple usually reaches out to the other developer directly.
3. **On Google Play:** Report the app under the Impersonation or Intellectual Property policy through Play Console.
4. **Track your branded search position over time**, not just once. A single check can miss a rival who backs off after a complaint, then quietly returns months later. [AppRankr's Rank Tracker](/rank) can watch exactly this — your own brand name, tracked as a keyword, checked automatically. You catch it early next time instead of by accident.

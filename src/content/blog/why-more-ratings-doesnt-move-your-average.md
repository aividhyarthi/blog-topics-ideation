---
title: "The Arithmetic Behind Why 100 New 5-Star Ratings Barely Move Your Average"
description: "You're getting more reviews and ratings than ever, but the number on your listing hasn't moved. It's not a delay or a bug — it's what averaging a batch of new ratings into a huge existing pool actually does."
theme: "Reviews & Ratings"
image: "/blog/og/why-more-ratings-doesnt-move-your-average.png"
publishDate: 2026-08-06
faqs:
  - question: "How many new 5-star ratings does it take to move my Google Play average by 0.1?"
    answer: "It depends entirely on your existing pool size, because the average is computed over your full rating history, not just recent activity. As a rough feel: an app with 1,000 existing ratings at a 4.0 average needs roughly 250 new 5-star ratings to reach 4.2. An app with 100,000 existing ratings at the same starting average needs roughly 25,000 new 5-star ratings to move the same 0.2 — the same percentage of the pool, but a vastly different absolute number."
  - question: "Does removing or fixing the cause of 1-star ratings help my average as much as adding 5-star ones?"
    answer: "Yes, and often more efficiently. A 1-star rating pulls the average down by roughly the same amount a 5-star rating pulls it up (both sit 1-2 points from center on a 5-point scale, but a 1-star is further from a 4+ average than a 5-star is above it). Fixing whatever's generating a cluster of 1-2 star ratings removes an active drag, rather than only trying to outrun it with new positive volume."
  - question: "Does the in-app 'rate this app' prompt count the same as someone writing a full review on the Play Store?"
    answer: "Both feed the same aggregate rating pool, star-only entries from an in-app prompt and full written reviews are counted together in your overall average. What differs is how many people actually leave text: most users who respond to an in-app prompt tap a star rating and dismiss it without writing anything, so a visible rise in written reviews doesn't necessarily mean a proportional rise in total rating volume — the two counts can move at different rates."
---

You've been running a rating-prompt campaign, or you've just had a genuinely good stretch, and the written reviews are visibly piling up. But the number on your listing, the one everyone actually looks at, hasn't budged. Not "moved a little slower than expected." Flat. It's a frustrating, common experience, and it isn't a display bug or Google sitting on your data. It's what happens when you add a batch of new ratings to an average that already has a large history behind it.

## The rating shown is an average over everything you've ever received, not just what's recent

Every new rating gets folded into the same running average as every rating that came before it, going back to launch. The bigger that existing pool already is, the less weight any single new batch carries, no matter how positive that batch is.

| Existing ratings | Existing average | New 5★ ratings added | New average | Net change |
|---|---|---|---|---|
| 500 | 4.00 | 100 | 4.17 | +0.17 |
| 5,000 | 4.00 | 100 | 4.02 | +0.02 |
| 50,000 | 4.00 | 100 | 4.001 | +0.001 |

The exact same 100 perfect ratings. Three wildly different results, purely because of how much history each one is being averaged against. This is the single most common reason "I'm getting more good reviews and the number hasn't changed" happens, and it has nothing to do with Google being slow.

## Ratings and written reviews aren't quite the same count

Google Play's in-app rating prompt (the native "How do you like the app?" popup, usually triggered via the Play In-App Review API) collects a star rating with no text most of the time — a large share of people who respond tap a star and move on without writing anything. Meanwhile, the written reviews you actually read and reply to are a smaller, more visible subset. Your written-review count going up is real and worth noticing, but it isn't a reliable proxy for how much your *total* rating volume grew, which is what actually moves the average. You can have a genuinely great month of written feedback that still barely dents the aggregate, because the underlying ratings pool grew by less than it felt like from where you were sitting.

## How long a new rating actually takes to show up

Google doesn't publish an exact recomputation schedule, but the widely observed pattern is that the visible number updates on a rolling basis, generally within roughly a day of new activity arriving, not instantly and not held back for weeks. If your number still isn't moving well after that window, the far more likely explanation is the arithmetic above, pool size versus new volume, rather than a display delay. Chasing a "why hasn't this refreshed yet" theory usually leads nowhere; doing the math usually explains the whole thing.

> **Real-world scenario:** A finance app with 80,000 existing ratings at a 4.10 average ran a deliberate, sustained rating-prompt push and collected 3,000 new 5-star ratings over a month, a genuinely large campaign by most standards. The average moved from 4.10 to 4.14. The team's first reaction was disappointment, reading it as "basically nothing happened," until they ran the same math shown above and realized a 0.04 shift against an 80,000-rating pool was actually a meaningful, real result, just never going to look dramatic on a number with that much history behind it.

## What actually moves the number

Since the lever is volume *relative to your existing pool*, not volume in isolation, three things matter more than a single push ever will:

- **Fix whatever's generating your 1-2★ ratings.** [A negative rating pulls the average down about as hard as a positive one pulls it up](/blog/1-2-star-reviews-hurting-search-rank), so removing the cause of ongoing complaints is at least as efficient as chasing new five-star volume, and it stops the pool from fighting you while you push.
- **Track the recent trend, not the all-time number.** [The ASO Inspector's rating view](/aso) reads a rolling recent window specifically because the all-time average is, by construction, anchored by history that may no longer reflect your current app.
- **Treat rating collection as sustained, not a one-off campaign.** A single push competes against your entire history every time; a steady, ongoing habit compounds against a pool that's also, gradually, becoming more "recent you."

The number not moving isn't a sign nothing is working. For any app with real history behind it, that's what a real, positive change is supposed to look like at first, small, and easy to mistake for nothing, until you check it against the size of the pool it's actually up against.

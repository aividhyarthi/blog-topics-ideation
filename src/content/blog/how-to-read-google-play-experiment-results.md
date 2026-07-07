---
title: "How to Read Google Play Experiment Results: Confidence, Conversion Lift & What to Do Next"
description: "What the numbers in a Play Console store listing experiment actually mean — conversion rate, lift, confidence — and how to avoid the most common misreadings."
theme: "Store Listing Experiments"
publishDate: 2026-07-09
faqs:
  - question: "What does 'conversion rate' mean in a Play Console experiment?"
    answer: "The share of people who viewed your store listing and went on to install the app, for that specific variant. Play Console compares this rate for each test variant against your current live listing (the control) over the same period."
  - question: "What is 'confidence' in a store listing experiment?"
    answer: "How sure Play Console is that a variant's difference in conversion rate is real and not just random noise in the traffic it happened to see. Low confidence with a big-looking lift is not a reliable result yet — it means there isn't enough data to trust that number."
  - question: "My variant shows a positive lift but low confidence — should I apply it?"
    answer: "Not yet. A promising-looking lift with low confidence is exactly the situation that reverses once more data comes in. Let the experiment keep running until confidence reaches a level Play Console is willing to call significant before deciding."
  - question: "Why did my conversion rate change even though I didn't run an experiment?"
    answer: "Store listing conversion rate moves on its own with traffic source mix, seasonality, competitor activity, and even your own rating trend — it's not a fixed number. That's exactly why experiments compare variants against a live control over the same window, rather than against a past baseline."
---

Running an experiment (see [how to run store listing experiments](/blog/how-to-run-store-listing-experiments)) is the easy part. Reading the results without fooling yourself is where most of the value — or most of the mistakes — actually happen.

## The three numbers that matter

**Store listing visitors.** How many people saw the listing (this variant, specifically) during the test window. This is your sample size — the number underneath everything else, and the reason low-traffic apps need longer test windows to say anything with confidence.

**Conversion rate.** Installs divided by store listing visitors, for that variant. This is the actual metric being compared between your control and your test variant(s).

**Confidence (or "probability to beat original").** How sure the underlying statistics are that the difference in conversion rate between a variant and the control reflects something real, rather than the ordinary noise you'd expect even if the two listings performed identically. This is the number to anchor decisions on — not the raw lift percentage by itself.

## Reading lift and confidence together

A lift number without its confidence is close to meaningless on its own. Two examples that look similar on the surface but aren't:

- **+8% lift, high confidence** — trustworthy. Apply it.
- **+8% lift, low confidence** — could easily be zero, or negative, once more traffic comes in. This is the number most likely to be over-interpreted if you're only glancing at the headline lift figure.

The instinct to declare a winner the moment a lift appears is understandable — but a positive-looking number early in a test is exactly as likely to be sampling noise as a true effect. That's what the confidence figure is there to guard against.

## Common misreadings to avoid

**Judging a test mid-flight.** Checking results daily and reacting to whichever variant is ahead that day is the single most common way to draw the wrong conclusion. Early leads regularly flip as more data accumulates — decide on a minimum run length up front (see the previous article) and don't act until you hit it.

**Ignoring where the traffic came from.** A conversion-rate change that coincides with a shift in traffic mix (say, a spike from a source that converts differently regardless of listing) can look like a listing effect when it's actually a traffic-mix effect. If something odd happened to your traffic sources mid-test, treat the result with extra skepticism.

**Conflating "no significant difference" with "the change didn't matter."** Sometimes a real difference exists but the test simply didn't run long enough, or get enough traffic, to detect it confidently. "Inconclusive" and "confirmed no difference" are not the same outcome, even though Play Console's dashboard can look similar at a glance if you don't check the confidence figure.

**Treating one result as universal.** A screenshot set that wins for your organic search traffic in one country isn't guaranteed to win for a paid-acquisition audience in another — different audiences arrive with different context and expectations. Strong results are a reason to test the same hypothesis in adjacent segments, not to assume it's now settled everywhere.

## What to actually do with a confirmed result

- **Apply confident winners promptly** — a validated improvement sitting untested-but-proven in a dashboard isn't helping your conversion rate.
- **Write down the hypothesis that won**, not just "new icon won." If the insight was "higher contrast against search-result backgrounds performs better," that's reusable knowledge for your next redesign, other markets, or a Custom Store Listing variant.
- **Re-test periodically, not just once.** Competitor listings change, design trends shift, and your own audience mix evolves — an icon that won an experiment a year ago isn't guaranteed to still be your best option today.

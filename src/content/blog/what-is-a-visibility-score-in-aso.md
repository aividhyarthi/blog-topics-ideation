---
title: "What Is a Visibility Score in ASO? How It's Calculated"
description: "One number meant to summarize where you stand across every keyword you're tracked on — not any single keyword's rank. Here's what actually goes into it and why it's weighted the way it is."
theme: "Fundamentals"
image: "/blog/og/what-is-a-visibility-score-in-aso.png"
publishDate: 2026-07-27
faqs:
  - question: "What is a visibility score in app store optimization?"
    answer: "A single number, typically 0-100, meant to summarize how well an app is positioned across its whole tracked keyword set at once — not any one keyword's individual rank. It rises when you rank higher across your keywords in aggregate, and falls when you rank lower, weighted so that top positions matter far more than mid-pack ones."
  - question: "What counts as a 'good' visibility score?"
    answer: "There's no universal good number — it depends entirely on your keyword list's competitiveness and how many terms you track. The useful comparison is always relative: your own score over time, and your score against the competitors you're actually tracked against, not an absolute benchmark borrowed from a different app's keyword list."
  - question: "Does visibility score include downloads or revenue?"
    answer: "No — it's a pure position-based signal, built only from where you rank in store search across your tracked keywords. Downloads, revenue, and ratings are separate, related metrics worth watching alongside it, not inputs to this particular number."
  - question: "Why does moving from #2 to #5 cost less score than moving from #50 to #150?"
    answer: "Because the weighting is logarithmic, not linear, matching how search traffic is actually distributed: almost all of it concentrates in the first few results, so the difference between #2 and #5 is small in real-world visibility terms, while the difference between #50 and #150 — both already invisible to almost anyone scrolling — is close to meaningless either way."
---

A keyword-by-keyword rank table tells you everything, which is also its problem: it's hard to tell at a glance whether your overall standing improved or got worse this week, especially once you're tracking more than a handful of terms. A visibility score exists to answer exactly that — one number, weighted the way search traffic actually behaves, that goes up when your real-world discoverability improves and down when it doesn't.

## The core idea: not all positions are worth the same

The single most important thing to understand about a visibility score is that it isn't a linear average of your positions. Search traffic is brutally front-loaded — the overwhelming majority of taps go to the first few results, and by position 30 or 50 you're already competing for a small fraction of what's left. A visibility score reflects that by weighting top positions far more heavily than mid-pack ones, using a logarithmic curve rather than a straight line.

Here's roughly what that curve looks like in practice, using a position-to-score mapping in the style most rank trackers (including ours) actually use:

| Position | Approximate score contribution |
|---|---|
| #1 | 100 |
| #5 | ~70 |
| #10 | ~57 |
| #30 | ~36 |
| #50 | ~26 |
| #100 | ~13 |
| #200 | ~0 |
| Beyond #200 (or unranked) | 0 |

The gap between #1 and #5 is about 30 points. The gap between #50 and #100 — a much bigger absolute move — is only about 13 points. That's the logarithmic weighting working as intended: it mirrors how little additional visibility you actually gain by climbing from deep-buried to slightly-less-buried, versus how much you gain by climbing into the top few results.

## How the whole-app number gets built

Your overall visibility score is the average of this per-keyword score across your entire tracked keyword list on a given day. That means two apps can have wildly different keyword-count strategies and still be meaningfully compared, because the score isn't "total points" — it's an average, so it isn't inflated just by tracking more keywords.

It also means the score responds asymmetrically to good and bad news, on purpose: losing your #1 position for your best keyword drags the average down by a lot, while losing a keyword you were already ranked #150 on barely moves it — which matches what actually happened to your real-world discoverability in both cases.

> **Real-world scenario:** A team was tracking 40 keywords and celebrated a week where 22 of them improved and only 3 got worse — "more than half improved, must be a good week." Their visibility score actually dropped. The reason: one of the 3 keywords that got worse was their single highest-volume term, where a competitor's app overtook them from #2 to #1, while the 22 improvements were mostly mid-pack keywords moving from position 80 to position 65 — real, but nearly weightless next to losing the top spot on the keyword that mattered most. The score caught what a simple win/loss count missed entirely.

## Why a single number is worth having at all

The keyword-by-keyword table is still where the real diagnostic work happens — a visibility score won't tell you *which* keyword moved or why. What it's good for is the same thing a stock index is good for versus reading every constituent's price individually: a fast, honest answer to "are things trending up or down overall," so you know whether to go looking for a cause before you've even opened the detailed table. If you're newer to which levers actually move it, [our ASO fundamentals piece](/blog/aso-101-what-actually-moves-your-rank) is the place to start.

## What to actually do with it

1. **Track your own visibility score over time**, not as a one-time snapshot — [a trend line here](/rank) tells you whether this week continued a pattern or broke one, which a single day's number can't.
2. **Compare it against the specific competitors you're tracked against**, not an industry benchmark — [a side-by-side visibility comparison](/rank) is a more honest read on standing than any absolute number.
3. **When it moves sharply, check your highest-volume keywords first** — a big swing is almost always concentrated in one or two heavily-weighted positions, not spread evenly across your whole list.
4. **Don't chase the number directly** — improve the keywords and listing quality that drive it, the same way you wouldn't optimize for a stock index without caring what the underlying companies actually do.

One number can't replace the detailed table, but it answers the question you actually ask first — "is this a good week or a bad one" — faster and more honestly than eyeballing forty rows of individual rank changes.

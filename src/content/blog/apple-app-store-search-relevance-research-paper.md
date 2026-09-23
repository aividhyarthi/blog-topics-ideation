---
title: "Apple Published Real Research on How It Ranks App Store Search Results"
description: "A peer-reviewed Apple paper names two actual relevance signals behind App Store search, and shows the biggest gains landed on long-tail, less common queries. Here's what it actually says."
theme: "App Store"
keyword: "App Store search relevance research"
image: "/blog/og/apple-app-store-search-relevance-research-paper.png"
publishDate: 2026-09-23
faqs:
  - question: "Did Apple actually publish research on how App Store search ranking works?"
    answer: "Yes. A paper titled \"Scaling Search Relevance: Augmenting App Store Ranking with LLM-Generated Judgments,\" from Apple's own machine learning research team, was published and presented at SIGIR, a peer-reviewed conference. It's a real, citable source, not a leak or a guess."
  - question: "What are behavioral relevance and textual relevance?"
    answer: "The paper names these as the two signals behind ranking. Behavioral relevance is what users actually do with a result: tap it, or download it. Textual relevance is how well an app's metadata matches the words someone searched."
  - question: "Why did long-tail search terms benefit most from this change?"
    answer: "The paper reports the biggest gains landed on tail queries. These are rare searches with little click or download history behind them. Textual relevance gives the system a real signal there, since behavioral data barely exists for a query nobody has searched much before."
---

**Key points:**
- Apple's own machine learning team published a real, peer-reviewed paper on App Store search ranking. It was presented at SIGIR: "[Scaling Search Relevance: Augmenting App Store Ranking with LLM-Generated Judgments](https://arxiv.org/abs/2602.23234)."
- The paper names two real signals. Behavioral relevance: taps and downloads. Textual relevance: how well an app's metadata matches a search.
- Apple fine-tuned a small LLM on human relevance judgments. It then used that model to generate millions of new textual relevance labels.
- A worldwide test found a real lift in conversion rate: 0.24%. The gain was statistically significant. The biggest gains landed on tail queries, the rare searches with little history behind them.

Apple almost never explains its App Store ranking directly. A real, peer-reviewed paper from Apple's own team just did. And it names the actual signals in plain terms.

## What the paper actually confirms

[The paper](https://arxiv.org/abs/2602.23234) comes from Apple's own machine learning team. It was shown at SIGIR, a real search research event. Real experts reviewed it first. It names two signals behind App Store ranking. Behavioral relevance is what people do with a result. Do they tap it? Do they download it? Textual relevance is how well an app's own text matches the words in a search. Not exact word matching. Real, deep fit.

| Detail | What the paper reports |
|---|---|
| Two named signals | Behavioral relevance, textual relevance |
| Model used to generate labels | A fine-tuned LLM |
| Test type | Worldwide A/B test on the live App Store ranker |
| Conversion rate result | +0.24%, statistically significant |
| Biggest gains | Tail queries, rare search terms |

## Why tail queries are the real story here

A popular search term has years of click history behind it. Behavioral relevance works well there. Plenty of real user data exists to learn from. A rare, long-tail term doesn't have that history. Almost nobody has typed it before. So there's barely any behavioral signal to use. This is exactly where the paper reports its biggest gains. Textual relevance fills that gap. It matches the query to an app's own metadata directly.

That's a real, direct reason to write metadata that answers specific search phrases. Not just generic, high-volume terms. A rare, specific phrase someone might type has real value here. Apple's own published method backs this up now. It isn't just industry guesswork anymore.

> **Real-world scenario:** A niche utility app's team had built their whole App Store metadata around a few high-volume, generic keywords. They assumed rare or specific phrases weren't worth writing for. Then they read Apple's own paper on textual and behavioral relevance. That changed their minds. They rewrote parts of their description and subtitle to directly answer a few specific phrases their own users had used in support emails and reviews. Those long-tail phrases had little search history to rank on behavioral signal alone. The paper's own findings said textual relevance would matter more there, not less.

## What to actually do about it

1. **Write metadata that answers specific search phrases.** Not just generic head terms. The paper says textual relevance carries real weight, especially where behavioral history is thin.
2. **Don't ignore long-tail, less common search terms.** The paper reports this as exactly where the gains landed. A rare phrase with real relevance to your app is worth writing for directly.
3. **Read the actual paper if this matters to your strategy.** Don't just rely on a summary. It's a real, public, peer-reviewed source. That beats secondhand paraphrasing, this piece included.
4. **Keep this in perspective.** A 0.24% conversion lift is real, but modest overall. It doesn't mean textual relevance replaced behavioral signals. It just fills a specific, real gap.

[AppRankr's ASO Inspector](/aso) checks how well your current metadata matches the actual terms people search for. That includes the specific, less common phrases worth writing for directly.
